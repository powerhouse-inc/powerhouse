import type {
  DefinitionDiagnostic,
  DefinitionPath,
  DocumentModelSpecificationDefinition,
} from "@powerhousedao/shared/document-model";
import type { DocumentNode, GraphQLError } from "graphql";
import { scalarCatalog } from "../../../../scalars/catalog.js";
import type { NormalizedDocumentModelArtifact } from "../../adapters/types.js";
import { type GraphQLModule, loadGraphQL } from "../../graphql/parse-schema.js";
import {
  type CheckDiagnosticCode,
  checkDiagnostics,
} from "../diagnostic-codes.js";
import {
  documentModelRef,
  servedSpecification,
} from "../../report/served-specification.js";
import type { DefinitionCheck } from "../types.js";

type Node = {
  readonly kind: string;
  readonly name?: { readonly value: string };
  readonly interfaces?: readonly {
    readonly name: { readonly value: string };
  }[];
};

/** The top-level node an error node sits in, and where a diagnostic points for it. */
type Owner = {
  readonly name: string | undefined;
  readonly implements: readonly string[];
  readonly path: DefinitionPath;
};

type ErrorCode = {
  readonly code: CheckDiagnosticCode;
  readonly repair: string;
};

/** The first graphql-js message pattern that matches picks the code. */
const ERROR_CODES: readonly (ErrorCode & { readonly pattern: RegExp })[] = [
  {
    pattern:
      /^(?:Interface field |Object field \S+ includes required argument |Type \S+ (?:must only implement|cannot implement|can only implement|must implement) )/,
    code: "PH-DM-INTERFACE-INVALID",
    repair:
      "Give the type every field, argument and ancestor interface its interfaces declare, with compatible types.",
  },
  {
    pattern: / must be (?:Input|Output) Type but got: /,
    code: "PH-DM-TYPE-POSITION-INVALID",
    repair:
      "Reference input types only from input fields and arguments, and output types only from output fields.",
  },
  {
    pattern: / within itself through a series of non-null fields: /,
    code: "PH-DM-INPUT-CYCLE",
    repair: "Make one input field on the cycle nullable or a list.",
  },
];

const OTHER_ERROR: ErrorCode = {
  code: "PH-DEF-COMPATIBILITY-INVALID",
  repair:
    "Correct the stored schema so graphql-js builds it; codegen and hosts build the same schema.",
};

/** A model's schema has no operations, so graphql-js has no Query root to require. */
const NO_QUERY_ROOT = "Query root type must be provided.";

/**
 * The SDL rules graphql-js applies, minus the directive rules: a stored
 * schema carries directive uses such as `@equals` without declaring them,
 * and codegen and hosts read them as annotations.
 */
function sdlRules(graphql: GraphQLModule) {
  return [
    graphql.LoneSchemaDefinitionRule,
    graphql.UniqueOperationTypesRule,
    graphql.UniqueTypeNamesRule,
    graphql.UniqueEnumValueNamesRule,
    graphql.UniqueFieldDefinitionNamesRule,
    graphql.UniqueArgumentDefinitionNamesRule,
    graphql.UniqueDirectiveNamesRule,
    graphql.KnownTypeNamesRule,
    graphql.PossibleTypeExtensionsRule,
    graphql.UniqueArgumentNamesRule,
    graphql.UniqueInputFieldNamesRule,
  ];
}

const NAMED_DEFINITION =
  /^(?:Scalar|Object|Interface|InputObject|Enum|Union)TypeDefinition$/;

/**
 * Hosts keep the first definition of a repeated type name and codegen merges
 * the repeats, so a repeat is not an error here. Catalog and project scalars
 * the document uses without declaring become stub declarations, and a type
 * the document only extends gets an empty base to extend.
 */
function validationDocument(
  nodes: readonly Node[],
  specification: DocumentModelSpecificationDefinition,
): DocumentNode {
  const defined = new Set<string>();
  const definitions: object[] = nodes.filter((node) => {
    if (!NAMED_DEFINITION.test(node.kind) || node.name === undefined) {
      return true;
    }
    if (defined.has(node.name.value)) return false;
    defined.add(node.name.value);
    return true;
  });
  const define = (kind: string, value: string) => {
    if (defined.has(value)) return;
    defined.add(value);
    definitions.push({
      kind,
      name: { kind: "Name", value },
      directives: [],
      interfaces: [],
      fields: [],
      values: [],
      types: [],
    });
  };
  for (const name of [
    ...scalarCatalog.map((scalar) => scalar.name),
    ...specification.scalars.map((scalar) => scalar.name),
  ]) {
    define("ScalarTypeDefinition", name);
  }
  for (const node of nodes) {
    if (node.kind.endsWith("TypeExtension") && node.name !== undefined) {
      define(node.kind.replace(/Extension$/, "Definition"), node.name.value);
    }
  }
  return { kind: "Document", definitions } as unknown as DocumentNode;
}

/**
 * Maps every object inside each top-level node to that node's owner. A
 * type's first definition points at its structured type; any other node
 * points at its place in the retained document.
 */
function ownersByNode(
  nodes: readonly Node[],
  specification: DocumentModelSpecificationDefinition,
  index: number,
): ReadonlyMap<object, Owner> {
  const typeIndex = new Map(
    specification.types.map((type, position) => [type.name, position]),
  );
  const firstDefinitions = new Set<string>();
  const owners = new Map<object, Owner>();
  nodes.forEach((node, nodeIndex) => {
    const name = node.name?.value;
    const position = name === undefined ? undefined : typeIndex.get(name);
    const first =
      name !== undefined &&
      NAMED_DEFINITION.test(node.kind) &&
      !firstDefinitions.has(name);
    if (first) firstDefinitions.add(name);
    const owner: Owner = {
      name,
      implements: (node.interfaces ?? []).map((entry) => entry.name.value),
      path:
        first && position !== undefined
          ? ["specifications", index, "types", position]
          : [
              "specifications",
              index,
              "graphQLCompatibility",
              "document",
              "definitions",
              nodeIndex,
            ],
    };
    const visit = (value: unknown): void => {
      if (value === null || typeof value !== "object") return;
      owners.set(value, owner);
      for (const child of Object.values(value)) visit(child);
    };
    visit(node);
  });
  return owners;
}

/**
 * The owner of an error's last node, except that an interface error belongs
 * to the type that implements another owner of the error, which graphql-js
 * may list before or after the interface's own nodes.
 */
function ownerOf(
  error: GraphQLError,
  owners: ReadonlyMap<object, Owner>,
): Owner | undefined {
  const candidates = (error.nodes ?? []).flatMap(
    (node) => owners.get(node) ?? [],
  );
  const names = new Set(candidates.map(({ name }) => name));
  return (
    candidates.findLast((owner) =>
      owner.implements.some((name) => names.has(name)),
    ) ?? candidates.at(-1)
  );
}

function checkArtifact(
  artifact: NormalizedDocumentModelArtifact,
): readonly DefinitionDiagnostic[] {
  const served = servedSpecification(artifact);
  const retained = served?.specification.graphQLCompatibility;
  if (served === undefined || retained === undefined || retained === null) {
    return [];
  }
  const { specification, index } = served;
  const graphql = loadGraphQL();
  const nodes = retained.document.definitions as readonly Node[];
  const document = validationDocument(nodes, specification);
  let errors: readonly GraphQLError[] = graphql.validateSDL(
    document,
    undefined,
    sdlRules(graphql),
  );
  if (errors.length === 0) {
    errors = graphql
      .validateSchema(
        graphql.buildASTSchema(document, { assumeValidSDL: true }),
      )
      .filter(({ message }) => message !== NO_QUERY_ROOT);
  }
  const owners = ownersByNode(nodes, specification, index);
  return errors.map((error) => {
    const { code, repair } =
      ERROR_CODES.find(({ pattern }) => pattern.test(error.message)) ??
      OTHER_ERROR;
    return checkDiagnostics.create({
      code,
      source: artifact.source,
      definition: documentModelRef(artifact),
      path: ownerOf(error, owners)?.path ?? [
        "specifications",
        index,
        "graphQLCompatibility",
      ],
      message: error.message,
      repair,
    });
  });
}

/**
 * The compiler validates every type it declares. A retained GraphQL document
 * is the schema codegen and hosts build, so graphql-js validates it as they
 * would.
 */
export const graphqlSchemaCheck: DefinitionCheck = {
  name: "graphql-schema",
  run: ({ artifacts }) => artifacts.flatMap(checkArtifact),
};
