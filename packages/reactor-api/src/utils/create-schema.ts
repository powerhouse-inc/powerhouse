import {
  buildSubgraphSchema,
  type GraphQLResolverMap,
  type GraphQLSchemaModule,
} from "@apollo/subgraph";
import type { Context } from "@powerhousedao/reactor-api";
import type {
  DocumentModelGlobalState,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { camelCase, kebabCase, pascalCase } from "change-case";
import {
  canonicalDigest,
  childLogger,
  formatDefinitionDiagnostic,
  packageScalarsOf,
  type ScalarBinding,
} from "document-model";
import { orderedScalarNames, scalarCatalog } from "document-model/scalars";
import {
  type DocumentNode,
  type GraphQLScalarType,
  Kind,
  parse,
  print,
  type ASTNode,
  type DefinitionNode,
  Lexer,
  type NameNode,
  Source,
  type StringValueNode,
  TokenKind,
  visit,
} from "graphql";
import { gql } from "graphql-tag";
import {
  type DocumentModelSchemaOptions,
  generateModelSchema,
  getDocumentModelSchemaName,
  hasValidSchema,
  type ModelProjection,
} from "../graphql/model-schema-templates.js";
import {
  HOST_SCALAR_RESOLVERS,
  packageScalarResolvers,
  unreportedScalarBindings,
} from "../graphql/scalar-bindings.js";
import { structuredModelProjection } from "../graphql/structured-model-schema.js";
import {
  printCompatibilityDocument,
  printNamespacedTypes,
  structuredModelOf,
  type StructuredModel,
  withHostDescriptions,
} from "../graphql/structured-projection.js";

export {
  type DocumentModelSchemaOptions,
  getDocumentModelSchemaName,
} from "../graphql/model-schema-templates.js";
import { createHash } from "node:crypto";

const logger = childLogger(["reactor-api", "create-schema"]);

/**
 * A subgraph defines a type whose name the generated document-model schema
 * owns, so one of the two definitions would be lost.
 */
export class SubgraphTypeCollisionError extends Error {
  readonly typeNames: string[];

  constructor(typeNames: string[]) {
    super(
      `Subgraph defines types reserved by the document-model schema: ${typeNames.join(", ")}`,
    );
    this.name = "SubgraphTypeCollisionError";
    this.typeNames = typeNames;
  }
}

/** A model's package scalar, under the name the host serves it by. */
type HostPackageScalar = {
  readonly name: string;
  readonly description: string;
  /**
   * Absent when the module's compiler recorded no binding. The host then
   * serves the scalar with GraphQL's default pass-through.
   */
  readonly binding: ScalarBinding | undefined;
};

/**
 * Collects the package scalars this host's code-first models declare, each
 * named with its model's prefix. Every subgraph carries every model's state
 * types, so each subgraph declares all of them. As in
 * `getDocumentModelTypeDefs`, only the first module with a given schema name
 * is projected. A binding is matched to its scalar by definition digest.
 */
function modelPackageScalars(
  documentModels: readonly DocumentModelModule[],
): readonly HostPackageScalar[] {
  const scalars: HostPackageScalar[] = [];
  const projected = new Set<string>();
  for (const module of documentModels) {
    const schemaName = getDocumentModelSchemaName(module.documentModel.global);
    if (projected.has(schemaName)) continue;
    projected.add(schemaName);
    const structured = structuredModelOf(module);
    if (structured === null) continue;
    const bindings = new Map(
      packageScalarsOf(module).map((binding) => [
        canonicalDigest(binding.definition),
        binding,
      ]),
    );
    for (const scalar of structured.specification.scalars) {
      if (!("definition" in scalar)) continue;
      scalars.push({
        name: `${schemaName}_${scalar.name}`,
        description: scalar.definition.description,
        binding: bindings.get(canonicalDigest(scalar.definition)),
      });
    }
  }
  return scalars;
}

/**
 * The check reads the object's shape because a scalar built by another
 * graphql copy fails `instanceof`.
 */
function authoredScalarNames(
  resolvers: Readonly<Record<string, unknown>>,
): ReadonlySet<string> {
  return new Set(
    Object.entries(resolvers).flatMap(([name, resolver]) => {
      const scalar = resolver as Partial<GraphQLScalarType> | null;
      return scalar !== null &&
        typeof scalar === "object" &&
        scalar.name === name &&
        typeof scalar.parseValue === "function" &&
        typeof scalar.serialize === "function"
        ? [name]
        : [];
    }),
  );
}

/**
 * Type-system definition kinds that GraphQL requires to be uniquely named.
 * A subgraph SDL with two definitions sharing a name fails federation
 * composition ("There can be only one type named X"), which is fatal to the
 * whole gateway. We dedupe these by name; field/operation/extension nodes are
 * left untouched.
 */
const TYPE_DEFINITION_KINDS = new Set<Kind>([
  Kind.OBJECT_TYPE_DEFINITION,
  Kind.ENUM_TYPE_DEFINITION,
  Kind.INPUT_OBJECT_TYPE_DEFINITION,
  Kind.INTERFACE_TYPE_DEFINITION,
  Kind.UNION_TYPE_DEFINITION,
  Kind.SCALAR_TYPE_DEFINITION,
]);

/**
 * Drop duplicate type-system definitions by name, keeping the first occurrence.
 * Deduping is by name across ALL kinds (a `type` and an `enum` sharing a name
 * collide in GraphQL too), so the first definition of a given name wins
 * regardless of kind. State types are emitted before operation types, so
 * keep-first preserves the authoritative state definition. This heals a document
 * model that defines the same name twice (global+local, state+operation, or
 * twice in one scope) so the assembled subgraph SDL composes instead of crashing
 * the gateway (Sentry #917).
 */
const dedupeTypeDefinitions = (
  definitions: readonly DefinitionNode[],
  seen = new Set<string>(),
): DefinitionNode[] =>
  definitions.filter((def) => {
    const name = typeDefinitionName(def);
    if (name === undefined) return true;
    if (seen.has(name)) {
      // A duplicate here would otherwise crash supergraph composition; log it so
      // production has a breadcrumb of which model shipped a duplicate name.
      logger.debug(`Dropping duplicate type definition: ${name}`);
      return false;
    }
    seen.add(name);
    return true;
  });

function typeDefinitionName(def: DefinitionNode): string | undefined {
  if (!TYPE_DEFINITION_KINDS.has(def.kind)) return undefined;
  return (def as { name?: { value: string } }).name?.value;
}

const EMPTY_DOCUMENT: DocumentNode = { kind: Kind.DOCUMENT, definitions: [] };

const OUTPUT_TYPE_KINDS = [
  Kind.OBJECT_TYPE_DEFINITION,
  Kind.OBJECT_TYPE_EXTENSION,
  Kind.ENUM_TYPE_DEFINITION,
  Kind.ENUM_TYPE_EXTENSION,
  Kind.UNION_TYPE_DEFINITION,
  Kind.UNION_TYPE_EXTENSION,
  Kind.INTERFACE_TYPE_DEFINITION,
  Kind.INTERFACE_TYPE_EXTENSION,
];

// Kinds whose names get prefixed: state schemas (inputs stripped) and operation schemas.
const STATE_PREFIX_KINDS = new Set<Kind>(OUTPUT_TYPE_KINDS);
const ALL_PREFIX_KINDS = new Set<Kind>([
  ...OUTPUT_TYPE_KINDS,
  Kind.INPUT_OBJECT_TYPE_DEFINITION,
  Kind.INPUT_OBJECT_TYPE_EXTENSION,
]);

// Nodes whose `name` is a type name: definitions, extensions and references.
const TYPE_NAME_KINDS = new Set<Kind>([
  ...ALL_PREFIX_KINDS,
  Kind.SCALAR_TYPE_DEFINITION,
  Kind.SCALAR_TYPE_EXTENSION,
  Kind.NAMED_TYPE,
]);

// Stub local state types dropped from legacy models.
const LOCAL_STATE_STUBS = new Set([
  "AccountSnapshotLocalState",
  "BudgetStatementLocalState",
  "ScopeFrameworkLocalState",
]);

/** Parse SDL; blank or comment-only input yields an empty document. */
function parseSdl(sdl: string): DocumentNode {
  const source = new Source(sdl);
  if (new Lexer(source).advance().kind === TokenKind.EOF) return EMPTY_DOCUMENT;
  try {
    return parse(source, { noLocation: true });
  } catch (error) {
    // Retry without stray semicolons, which GraphQL rejects.
    const withoutSemicolons = sdl.replaceAll(";", "");
    if (withoutSemicolons === sdl) throw error;
    return parse(withoutSemicolons, { noLocation: true });
  }
}

function definedTypeNames(
  doc: DocumentNode,
  kinds: ReadonlySet<Kind>,
): string[] {
  return doc.definitions
    .filter((def) => kinds.has(def.kind))
    .map((def) => (def as DefinitionNode & { name: NameNode }).name.value);
}

/** Prefix type definition names and type references found in `names`. */
function prefixTypeNames(
  doc: DocumentNode,
  prefix: string,
  names: ReadonlySet<string>,
): DocumentNode {
  return visit(doc, {
    enter(node: ASTNode) {
      if (!TYPE_NAME_KINDS.has(node.kind)) return undefined;
      const { name } = node as ASTNode & { name: NameNode };
      if (!names.has(name.value)) return undefined;
      return { ...node, name: { ...name, value: `${prefix}_${name.value}` } };
    },
  });
}

/** State schema definitions without inputs, `DateTime` or the given object types. */
function stateTypeDefinitions(
  sdl: string,
  droppedObjectTypes: ReadonlySet<string> = new Set(),
): DefinitionNode[] {
  return parseSdl(sdl).definitions.filter(
    (def) =>
      def.kind !== Kind.INPUT_OBJECT_TYPE_DEFINITION &&
      def.kind !== Kind.INPUT_OBJECT_TYPE_EXTENSION &&
      !(
        def.kind === Kind.SCALAR_TYPE_DEFINITION &&
        def.name.value === "DateTime"
      ) &&
      !(
        def.kind === Kind.OBJECT_TYPE_DEFINITION &&
        droppedObjectTypes.has(def.name.value)
      ),
  );
}

export type SubgraphSchemaOptions = {
  /**
   * Types the subgraph's own schema generator emits, as a document model's
   * subgraph has. These may repeat a generated definition, which is kept.
   */
  ownTypeNames?: ReadonlySet<string>;
  /** Generated types already built for `documentModels`. */
  generated?: GeneratedDocumentModelTypes;
  /**
   * Whether to log the scalar findings this process has not reported yet.
   * A build that only checks passes `false`, so the host still logs them.
   */
  reportScalars?: boolean;
};

export const buildSubgraphSchemaModule = (
  documentModels: DocumentModelModule[],
  resolvers: GraphQLResolverMap<Context>,
  typeDefs: DocumentNode,
  options: SubgraphSchemaOptions = {},
): GraphQLSchemaModule => {
  // Later spreads win. A model's package scalars override an authored
  // resolver of the same name, and the host's two coercers override both.
  // Existing clients depend on the host coercers winning.
  const packageScalars = modelPackageScalars(documentModels).flatMap(
    ({ name, binding }) => (binding === undefined ? [] : [{ name, binding }]),
  );
  const newResolvers = {
    ...resolvers,
    ...packageScalarResolvers(packageScalars),
    ...HOST_SCALAR_RESOLVERS,
  };
  const moduleTypeDefs = assembleSubgraphTypeDefs(
    options.generated ?? getGeneratedDocumentModelTypes(documentModels),
    typeDefs,
    options.ownTypeNames,
  );
  const boundPackageScalars = new Set([
    ...packageScalars.map(({ name }) => name),
    ...authoredScalarNames(resolvers),
  ]);

  // The scalar report only logs. A throw from it must not stop the subgraph
  // from composing, so it is caught.
  if (options.reportScalars !== false) {
    try {
      for (const diagnostic of unreportedScalarBindings(
        moduleTypeDefs,
        resolvers,
        boundPackageScalars,
      )) {
        logger.warn(formatDefinitionDiagnostic(diagnostic));
      }
    } catch (error) {
      logger.debug("scalar binding report failed: @error", error);
    }
  }

  return {
    typeDefs: moduleTypeDefs,
    resolvers: newResolvers,
  };
};
export const createSchema = (
  documentModels: DocumentModelModule[],
  resolvers: GraphQLResolverMap<Context>,
  typeDefs: DocumentNode,
  options: SubgraphSchemaOptions = {},
) => {
  // Array form: @apollo/subgraph 2.15 dropped the bare-module overload.
  return buildSubgraphSchema([
    buildSubgraphSchemaModule(documentModels, resolvers, typeDefs, options),
  ]);
};

/**
 * Create a merged GraphQL schema from multiple subgraph modules.
 * Uses buildSubgraphSchema's array overload to combine type definitions
 * and resolvers from multiple subgraphs into a single executable schema.
 */
export const createMergedSchema = (modules: GraphQLSchemaModule[]) => {
  return buildSubgraphSchema(modules);
};

/**
 * The `IDocument` type each model contributes to the composed host schema.
 * Both projections use it, and only the state type it references differs.
 */
function documentWrapperType(
  schemaName: string,
  stateRootName: string,
): string {
  const typedState = schemaName !== "DocumentModel";
  return `
    type ${schemaName} implements IDocument {
              id: String!
              name: String!
              documentType: String!
              operations(skip: Int, first: Int): [Operation!]!
              revision: Int!
              createdAtUtcIso: DateTime!
              lastModifiedAtUtcIso: DateTime!
              ${typedState ? `initialState: ${schemaName}_${stateRootName}!` : ""}
              ${typedState ? `state: ${schemaName}_${stateRootName}!` : ""}
              stateJSON: JSONObject
          }\n`;
}

/**
 * A model as a module, or as the global state a schema-first model's JSON
 * holds. Only a module carries a code-first model's structured definition.
 */
export type DocumentModelSource =
  | DocumentModelModule
  | DocumentModelGlobalState;

export const isDocumentModelModule = (
  source: DocumentModelSource,
): source is DocumentModelModule => "documentModel" in source;

export const globalStateOf = (
  source: DocumentModelSource,
): DocumentModelGlobalState =>
  isDocumentModelModule(source) ? source.documentModel.global : source;

/**
 * The latest version of each model, by name: the only one whose own subgraph
 * the server registers.
 */
export function latestDocumentModelVersions<M extends DocumentModelSource>(
  documentModels: readonly M[],
): M[] {
  const versionOf = (source: M) =>
    (isDocumentModelModule(source) ? source.version : undefined) ??
    globalStateOf(source).specifications.at(-1)?.version ??
    0;
  const latestByName = new Map<string, M>();
  for (const documentModel of documentModels) {
    const { name } = globalStateOf(documentModel);
    const existing = latestByName.get(name);
    if (!existing || versionOf(documentModel) > versionOf(existing)) {
      latestByName.set(name, documentModel);
    }
  }
  return Array.from(latestByName.values());
}

/** The name the model's own subgraph registers under. */
export function getDocumentModelSubgraphName(
  documentModel: DocumentModelGlobalState,
): string {
  return kebabCase(documentModel.name);
}

/**
 * The state types a code-first model contributes, namespaced from the
 * structured definition. Inputs declared beside the state are dropped, as the
 * stored-SDL path strips `input` blocks. `generateModelSchema` prints the
 * global ones as state input types.
 */
function structuredModelStateTypes(
  model: StructuredModel,
  schemaName: string,
  hostDescriptions: ReadonlyMap<string, string>,
): string {
  const { specification, segments, packageScalars } = model;
  const wrapper = documentWrapperType(
    schemaName,
    specification.state.global.root.name,
  );
  if (specification.graphQLCompatibility !== null) {
    // A retained GraphQL AST is projected whole, including its type extensions.
    return (
      printCompatibilityDocument(
        withHostDescriptions(
          specification.graphQLCompatibility.document,
          hostDescriptions,
        ),
        schemaName,
        packageScalars,
      ) + wrapper
    );
  }
  const stateTypes = [...segments.global, ...segments.local].flatMap((type) =>
    type.kind === "input"
      ? []
      : [
          {
            ...type,
            description:
              type.description ?? hostDescriptions.get(type.name) ?? null,
          },
        ],
  );
  return printNamespacedTypes(model, stateTypes, schemaName) + wrapper;
}

function storedModelStateTypes(
  documentModel: DocumentModelGlobalState,
  dmSchemaName: string,
): string {
  const latestSpec = documentModel.specifications.at(-1);
  const definitions = [
    ...stateTypeDefinitions(latestSpec?.state.global.schema ?? ""),
    ...stateTypeDefinitions(
      latestSpec?.state.local.schema ?? "",
      LOCAL_STATE_STUBS,
    ),
  ];
  const stateDoc: DocumentNode = { kind: Kind.DOCUMENT, definitions };
  const prefixed = prefixTypeNames(
    stateDoc,
    dmSchemaName,
    new Set(definedTypeNames(stateDoc, STATE_PREFIX_KINDS)),
  );
  return (
    (definitions.length > 0 ? `${print(prefixed)}\n` : "") +
    documentWrapperType(dmSchemaName, `${dmSchemaName}State`)
  );
}

/**
 * The scalars every document-model subgraph declares, in the order the host
 * has always printed them. A scalar added to the catalog later is appended.
 */
const SUBGRAPH_SCALAR_TYPE_DEFS = orderedScalarNames(scalarCatalog.names, [
  "JSONObject",
  "AttachmentRef",
  "Unknown",
  "Address",
  "Amount_Tokens",
  "EthereumAddress",
  "Amount_Percentage",
  "EmailAddress",
  "Date",
  "DateTime",
  "URL",
  "Amount_Money",
  "OLabel",
  "Currency",
  "PHID",
  "OID",
  "Amount_Fiat",
  "Amount_Currency",
  "Amount_Crypto",
  "Amount",
  "Upload",
])
  .map((name) => `scalar ${name}`)
  .join("\n");

/**
 * The generated document-model types followed by the subgraph's own. Throws
 * {@link SubgraphTypeCollisionError} when the subgraph defines a generated
 * name not in `ownTypeNames`.
 */
export const getDocumentModelTypeDefs = (
  documentModels: DocumentModelModule[],
  typeDefs: DocumentNode,
  ownTypeNames?: ReadonlySet<string>,
): DocumentNode =>
  assembleSubgraphTypeDefs(
    getGeneratedDocumentModelTypes(documentModels),
    typeDefs,
    ownTypeNames,
  );

/** Names of the type definitions in `doc`. */
export function typeDefinitionNames(doc: DocumentNode): Set<string> {
  return new Set(
    doc.definitions
      .map(typeDefinitionName)
      .filter((name) => name !== undefined),
  );
}

/** The generated document-model schema every subgraph is assembled onto. */
export type GeneratedDocumentModelTypes = {
  definitions: readonly DefinitionNode[];
  names: ReadonlySet<string>;
};

function storedModelDefinitions(
  documentModel: DocumentModelGlobalState,
): readonly DefinitionNode[] {
  return parseSdl(
    storedModelStateTypes(
      documentModel,
      getDocumentModelSchemaName(documentModel),
    ),
  ).definitions;
}

/** The definitions `documentModel` adds to the generated schema. */
function documentModelDefinitions(
  documentModel: DocumentModelSource,
): readonly DefinitionNode[] {
  if (!isDocumentModelModule(documentModel))
    return storedModelDefinitions(documentModel);
  const global = documentModel.documentModel.global;
  const structured = structuredModelOf(documentModel);
  if (structured === null) return storedModelDefinitions(global);
  return parseSdl(
    structuredModelStateTypes(
      structured,
      getDocumentModelSchemaName(global),
      new Map(),
    ),
  ).definitions;
}

/** Type name → whether every definition of that name is a scalar. */
export type ReservedTypeNames = ReadonlyMap<string, boolean>;

function addScalarFlags(
  definitions: readonly DefinitionNode[],
  into: Map<string, boolean>,
): Map<string, boolean> {
  for (const def of definitions) {
    const name = typeDefinitionName(def);
    if (name === undefined) continue;
    const scalar = def.kind === Kind.SCALAR_TYPE_DEFINITION;
    into.set(name, scalar && (into.get(name) ?? true));
  }
  return into;
}

let fixedGeneratedTypes: ReservedTypeNames | undefined;

/**
 * Type names no document model may generate: the root types, the generated
 * types every schema carries, and the types of `coreTypeDefs`.
 */
export function reservedTypeNames(
  coreTypeDefs: Iterable<DocumentNode>,
): ReservedTypeNames {
  fixedGeneratedTypes ??= addScalarFlags(
    getGeneratedDocumentModelTypes([]).definitions,
    new Map(),
  );
  const reserved = new Map([
    ["Query", false],
    ["Mutation", false],
    ["Subscription", false],
    ...fixedGeneratedTypes,
  ]);
  for (const typeDefs of coreTypeDefs) {
    addScalarFlags(typeDefs.definitions, reserved);
  }
  return reserved;
}

/**
 * The reserved names `documentModel`'s generated types take. A scalar may
 * repeat a reserved scalar: the duplicate is dropped on assembly.
 */
export function reservedTypeNamesTaken(
  documentModel: DocumentModelSource,
  reserved: ReservedTypeNames,
  definitions: readonly DefinitionNode[] = documentModelDefinitions(
    documentModel,
  ),
): string[] {
  const generated = addScalarFlags(definitions, new Map());
  return Array.from(generated)
    .filter(
      ([name, scalar]) => reserved.has(name) && !(scalar && reserved.get(name)),
    )
    .map(([name]) => name);
}

const GENERATED_SCALARS = gql`
  ${SUBGRAPH_SCALAR_TYPE_DEFS}
`.definitions;

const GENERATED_HEAD = gql`
  type PHOperationContext {
    signer: Signer
  }

  type Signer {
    user: SignerUser
    app: SignerApp
    signatures: [String!]!
  }

  type SignerUser {
    address: String!
    networkId: String!
    chainId: Int!
  }

  type SignerApp {
    name: String!
    key: String!
  }

  type Operation {
    id: String!
    type: String!
    index: Int!
    timestampUtcMs: DateTime!
    hash: String!
    skip: Int
    inputText: String
    error: String
    context: PHOperationContext
  }

  interface IDocument {
    id: String!
    name: String!
    documentType: String!
    revision: Int!
    createdAtUtcIso: DateTime!
    lastModifiedAtUtcIso: DateTime!
    operations(first: Int, skip: Int): [Operation!]!
    stateJSON: JSONObject
  }
`.definitions;

const GENERATED_TAIL = gql`
  type GqlDocument implements IDocument {
    id: String!
    name: String!
    documentType: String!
    revision: Int!
    createdAtUtcIso: DateTime!
    lastModifiedAtUtcIso: DateTime!
    operations(first: Int, skip: Int): [Operation!]!
    stateJSON: JSONObject
  }

  type DriveDocument implements IDocument {
    id: String!
    name: String!
    documentType: String!
    revision: Int!
    createdAtUtcIso: DateTime!
    lastModifiedAtUtcIso: DateTime!
    operations(first: Int, skip: Int): [Operation!]!
    stateJSON: JSONObject
  }
`.definitions;

/** {@link generatedTypesOf} for modules. */
export function getGeneratedDocumentModelTypes(
  documentModels: DocumentModelModule[],
  schemas?: ReadonlyMap<DocumentModelModule, DocumentModelSchema>,
): GeneratedDocumentModelTypes {
  return generatedTypesOf(documentModels, schemas);
}

/**
 * The generated schema for `documentModels`, modules or stored global states.
 * `schemas` supplies models' definitions already built; the others are built
 * here.
 */
export function generatedTypesOf(
  documentModels: readonly DocumentModelSource[],
  schemas?: ReadonlyMap<DocumentModelSource, DocumentModelSchema>,
): GeneratedDocumentModelTypes {
  return generatedTypesFrom(
    documentModels.map((source) => ({
      global: globalStateOf(source),
      definitions: () =>
        schemas?.get(source)?.generated ?? documentModelDefinitions(source),
    })),
    modelPackageScalars(documentModels.filter(isDocumentModelModule)),
  );
}

function packageScalarDefinitions(
  packageScalars: readonly HostPackageScalar[],
): readonly DefinitionNode[] {
  return parseSdl(
    packageScalars
      .map(
        ({ name, description }) =>
          `${JSON.stringify(description)}\nscalar ${name}`,
      )
      .join("\n"),
  ).definitions;
}

function generatedTypesFrom(
  documentModels: readonly {
    global: DocumentModelGlobalState;
    definitions: () => readonly DefinitionNode[];
  }[],
  packageScalars: readonly HostPackageScalar[],
): GeneratedDocumentModelTypes {
  const modelDefinitions: DefinitionNode[] = [];
  const addedDocumentModels = new Set<string>();
  documentModels.forEach(({ global, definitions }) => {
    const dmSchemaName = getDocumentModelSchemaName(global);
    if (addedDocumentModels.has(dmSchemaName)) {
      logger.debug(
        `Skipping document model with duplicate name: ${dmSchemaName}`,
      );
      return;
    }
    addedDocumentModels.add(dmSchemaName);
    modelDefinitions.push(...definitions());
  });

  const definitions = dedupeTypeDefinitions([
    ...GENERATED_SCALARS,
    ...packageScalarDefinitions(packageScalars),
    ...GENERATED_HEAD,
    ...modelDefinitions,
    ...GENERATED_TAIL,
  ]);
  const names = typeDefinitionNames({ kind: Kind.DOCUMENT, definitions });
  return { definitions, names };
}

/** What a document model contributes to the GraphQL schema. */
export type DocumentModelSchema = {
  /** Its definitions in the generated schema every subgraph carries. */
  generated: readonly DefinitionNode[];
  /** Its own subgraph's types, when it has operations to serve. */
  subgraph?: { typeDefs: DocumentNode; typeNames: ReadonlySet<string> };
  /** Why its own subgraph cannot be served; its generated types still can. */
  subgraphError?: Error;
};

/** Whether any operation of the latest specification has a schema. */
export function hasOperationSchemas(documentModel: DocumentModelGlobalState) {
  const specification = documentModel.specifications.at(-1);
  if (!specification) return false;
  return specification.modules.some((module) =>
    module.operations.some((op) => hasValidSchema(op.schema)),
  );
}

/**
 * The types of a document model's own subgraph. Pass the module so a
 * code-first model is projected from its structured definition.
 */
export function documentModelSubgraphTypes(
  documentModel: DocumentModelSource,
): { typeDefs: DocumentNode; typeNames: ReadonlySet<string> } {
  const typeDefs = generateDocumentModelSchema(documentModel, {
    useNewApi: true,
  });
  return { typeDefs, typeNames: typeDefinitionNames(typeDefs) };
}

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

/** Build `subgraph` over the generated types of `documentModel` alone. */
function checkBuilds(
  documentModel: DocumentModelSource,
  generated: readonly DefinitionNode[],
  subgraph?: DocumentModelSchema["subgraph"],
): void {
  buildSubgraphSchema([
    {
      typeDefs: assembleSubgraphTypeDefs(
        generatedTypesOf(
          [documentModel],
          new Map([[documentModel, { generated }]]),
        ),
        subgraph?.typeDefs ?? EMPTY_DOCUMENT,
        subgraph?.typeNames,
      ),
    },
  ]);
}

/** Throws when the generated types every subgraph carries do not build. */
export function buildDocumentModelSchema(
  documentModel: DocumentModelSource,
  options: { subgraph?: boolean } = {},
): DocumentModelSchema {
  const generated = documentModelDefinitions(documentModel);
  if (
    options.subgraph === false ||
    !hasOperationSchemas(globalStateOf(documentModel))
  ) {
    checkBuilds(documentModel, generated);
    return { generated };
  }
  try {
    const subgraph = documentModelSubgraphTypes(documentModel);
    checkBuilds(documentModel, generated, subgraph);
    return { generated, subgraph };
  } catch (error) {
    checkBuilds(documentModel, generated);
    return { generated, subgraphError: toError(error) };
  }
}

/** A document model's schema, or why it is unusable, under its source key. */
export type ResolvedDocumentModelSchema = {
  model: DocumentModelModule;
  key: string;
} & (
  | { schema: DocumentModelSchema; error?: undefined }
  | { schema?: undefined; error: Error }
);

/** Hash of everything {@link buildDocumentModelSchema} reads. */
function schemaSourceKey(documentModel: DocumentModelModule): string {
  const { name, specifications } = documentModel.documentModel.global;
  const structured = structuredModelOf(documentModel);
  return createHash("sha256")
    .update(
      JSON.stringify([name, specifications.at(-1), structured?.digest ?? null]),
    )
    .digest("base64");
}

/** Schemas and failures by source hash, for the last resolve's models only. */
export class DocumentModelSchemaCache {
  #entries = new Map<string, DocumentModelSchema | Error>();
  readonly #build: (documentModel: DocumentModelModule) => DocumentModelSchema;

  constructor(build = buildDocumentModelSchema) {
    this.#build = build;
  }

  resolve(
    documentModels: readonly DocumentModelModule[],
  ): ResolvedDocumentModelSchema[] {
    const entries = new Map<string, DocumentModelSchema | Error>();
    const resolved = documentModels.map(
      (model): ResolvedDocumentModelSchema => {
        let key: string;
        let entry: DocumentModelSchema | Error | undefined;
        try {
          key = schemaSourceKey(model);
          entry = entries.get(key) ?? this.#entries.get(key);
        } catch (error) {
          key = `unkeyed:${model.documentModel.global.id}`;
          entry = toError(error);
        }
        if (entry === undefined) {
          try {
            entry = this.#build(model);
          } catch (error) {
            entry = toError(error);
          }
        }
        entries.set(key, entry);
        return entry instanceof Error
          ? { model, key, error: entry }
          : { model, key, schema: entry };
      },
    );
    this.#entries = entries;
    return resolved;
  }
}

/** Whether the server admits a model, and why not when it refuses one. */
export type DocumentModelAdmission =
  | {
      admitted: true;
      schema: DocumentModelSchema;
      /** Why its own subgraph is refused; its generated types still serve. */
      subgraphRefusal?: string;
    }
  | {
      admitted: false;
      refusal: "unusable schema" | "reserved names";
      reason: string;
    };

/**
 * The server's decision on one built model: it refuses a model whose schema
 * does not build or that generates a reserved type name.
 */
export function admitDocumentModel(
  resolved: { model: DocumentModelSource } & (
    | { schema: DocumentModelSchema; error?: undefined }
    | { schema?: undefined; error: Error }
  ),
  reserved: ReservedTypeNames,
): DocumentModelAdmission {
  if (resolved.schema === undefined) {
    return {
      admitted: false,
      refusal: "unusable schema",
      reason: `has an unusable schema: ${resolved.error.message}`,
    };
  }
  const { model, schema } = resolved;
  const taken = reservedTypeNamesTaken(model, reserved, schema.generated);
  if (taken.length > 0) {
    return {
      admitted: false,
      refusal: "reserved names",
      reason: `generates reserved type names: ${taken.join(", ")}`,
    };
  }
  return {
    admitted: true,
    schema,
    ...(schema.subgraphError !== undefined && {
      subgraphRefusal: `has an unusable subgraph schema: ${schema.subgraphError.message}`,
    }),
  };
}

/**
 * Names of the generated types `typeDefs` redefines, other than those a
 * model's own subgraph may repeat. Scalars are dropped on assembly, so they
 * never collide.
 */
export function findSubgraphTypeCollisions(
  generated: GeneratedDocumentModelTypes,
  typeDefs: DocumentNode,
  ownTypeNames?: ReadonlySet<string>,
): string[] {
  ownTypeNames ??= templateOwners.has(typeDefs)
    ? typeDefinitionNames(typeDefs)
    : undefined;
  const collisions: string[] = [];
  for (const def of typeDefs.definitions) {
    if (def.kind === Kind.SCALAR_TYPE_DEFINITION) continue;
    const name = typeDefinitionName(def);
    if (name === undefined || !generated.names.has(name)) continue;
    if (ownTypeNames?.has(name)) continue;
    collisions.push(name);
  }
  return collisions;
}

/** Throws {@link SubgraphTypeCollisionError}; see {@link getDocumentModelTypeDefs}. */
export function assembleSubgraphTypeDefs(
  generated: GeneratedDocumentModelTypes,
  typeDefs: DocumentNode,
  ownTypeNames?: ReadonlySet<string>,
): DocumentNode {
  const collisions = findSubgraphTypeCollisions(
    generated,
    typeDefs,
    ownTypeNames,
  );
  if (collisions.length > 0) {
    throw new SubgraphTypeCollisionError(collisions);
  }
  const subgraphDefinitions = typeDefs.definitions.filter(
    (def) =>
      def.kind !== Kind.SCALAR_TYPE_DEFINITION ||
      !generated.names.has(def.name.value),
  );

  const ownDescriptions = templateOwners.get(typeDefs);
  const definitions = generated.definitions.map((def) => {
    if (
      !("name" in def) ||
      def.name === undefined ||
      !("description" in def) ||
      def.description
    ) {
      return def;
    }
    const description = ownDescriptions?.get(`${def.kind}:${def.name.value}`);
    return description === undefined ? def : { ...def, description };
  });

  return {
    kind: Kind.DOCUMENT,
    definitions: [
      ...definitions,
      ...dedupeTypeDefinitions(subgraphDefinitions, new Set(generated.names)),
    ],
  };
}

/**
 * Extract the names of types defined in a GraphQL schema.
 * Unparseable schemas yield no names.
 */
function extractTypeNames(schema: string): string[] {
  try {
    return definedTypeNames(parseSdl(schema), ALL_PREFIX_KINDS);
  } catch (error) {
    logger.debug(`Skipping unparseable schema: ${String(error)}`);
    return [];
  }
}

/**
 * Print the input type definitions of a GraphQL schema.
 * @param excludeTypeNames - Input type names to leave out
 */
function extractInputTypeDefinitions(
  schema: string,
  excludeTypeNames: Set<string> = new Set(),
): string {
  const definitions = parseSdl(schema).definitions.filter(
    (def) =>
      def.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION &&
      !excludeTypeNames.has(def.name.value),
  );
  if (definitions.length === 0) return "";
  return print({ kind: Kind.DOCUMENT, definitions });
}

/**
 * AST type node shape for recursive type conversion.
 */
type GraphQLTypeNode = {
  kind: Kind;
  name?: { value: string };
  type?: GraphQLTypeNode;
};

/**
 * Extract the root state type name from a scope's GraphQL schema.
 * Uses the naming convention: {DocumentName}State for global,
 * {DocumentName}{PascalScope}State for other scopes (e.g., DocumentDriveLocalState).
 * Falls back to the last ObjectTypeDefinition (root types are conventionally last).
 */
function extractRootTypeName(
  schema: string,
  documentName: string,
  scopeName: string,
): string | null {
  try {
    const ast = parse(schema);

    // Try conventions:
    // 1. {DocumentName}State for global, {DocumentName}{Scope}State otherwise
    // 2. {DocumentName}GlobalState (DocumentModel uses this variant)
    const scopeSuffix = scopeName === "global" ? "" : pascalCase(scopeName);
    const candidates = [
      `${documentName}${scopeSuffix}State`,
      `${documentName}${pascalCase(scopeName)}State`,
    ];

    let lastObjectType: string | null = null;
    for (const def of ast.definitions) {
      if (def.kind === Kind.OBJECT_TYPE_DEFINITION) {
        if (candidates.includes(def.name.value)) {
          return def.name.value;
        }
        lastObjectType = def.name.value;
      }
    }

    // Fallback: last object type (root state types are defined last by convention)
    return lastObjectType;
  } catch {
    // ignore parse errors
  }
  return null;
}

/**
 * Convert a GraphQL output type AST node to an optional input type string.
 * Strips non-null markers and converts object type references to Input suffix.
 */
function convertTypeNodeToInput(
  typeNode: GraphQLTypeNode,
  objectNames: Set<string>,
  unionNames: Set<string>,
  interfaceNames: Set<string>,
): string {
  if (typeNode.kind === Kind.NON_NULL_TYPE && typeNode.type) {
    return convertTypeNodeToInput(
      typeNode.type,
      objectNames,
      unionNames,
      interfaceNames,
    );
  }
  if (typeNode.kind === Kind.LIST_TYPE && typeNode.type) {
    const inner = convertTypeNodeToInput(
      typeNode.type,
      objectNames,
      unionNames,
      interfaceNames,
    );
    return `[${inner}]`;
  }
  if (typeNode.kind === Kind.NAMED_TYPE && typeNode.name) {
    const name = typeNode.name.value;
    if (objectNames.has(name)) return `${name}Input`;
    if (unionNames.has(name) || interfaceNames.has(name)) return "JSONObject";
    return name;
  }
  return "JSONObject";
}

/**
 * Generate GraphQL input type definitions from a state schema string.
 * Converts output type definitions to input types with all fields optional.
 * - Object type references get Input suffix
 * - Union/interface references become JSONObject
 * - Enums and scalars remain unchanged
 */
function generateStateInputTypes(
  stateSchema: string,
  excludeTypeNames?: Set<string>,
): string {
  if (!stateSchema || !stateSchema.trim()) return "";

  let ast;
  try {
    ast = parse(stateSchema);
  } catch {
    return "";
  }

  const enumNames = new Set<string>();
  const unionNames = new Set<string>();
  const interfaceNames = new Set<string>();
  const objectNames = new Set<string>();
  const existingInputNames = new Set<string>();

  for (const def of ast.definitions) {
    switch (def.kind) {
      case Kind.ENUM_TYPE_DEFINITION:
        enumNames.add(def.name.value);
        break;
      case Kind.UNION_TYPE_DEFINITION:
        unionNames.add(def.name.value);
        break;
      case Kind.INTERFACE_TYPE_DEFINITION:
        interfaceNames.add(def.name.value);
        break;
      case Kind.OBJECT_TYPE_DEFINITION:
        objectNames.add(def.name.value);
        break;
      case Kind.INPUT_OBJECT_TYPE_DEFINITION:
        existingInputNames.add(def.name.value);
        break;
    }
  }

  const inputTypes: string[] = [];

  for (const def of ast.definitions) {
    if (def.kind !== Kind.OBJECT_TYPE_DEFINITION) continue;
    // Skip if an input type with the same name already exists in the schema
    // or in operation schemas (to avoid duplicates with moduleSchemas)
    const inputName = `${def.name.value}Input`;
    if (existingInputNames.has(inputName)) continue;
    if (excludeTypeNames?.has(inputName)) continue;
    const fields = def.fields ?? [];
    if (fields.length === 0) continue;

    const inputFields = fields.map((field) => {
      const fieldName = field.name.value;
      const fieldType = convertTypeNodeToInput(
        field.type as GraphQLTypeNode,
        objectNames,
        unionNames,
        interfaceNames,
      );
      return `  ${fieldName}: ${fieldType}`;
    });

    inputTypes.push(
      `input ${def.name.value}Input {\n${inputFields.join("\n")}\n}`,
    );
  }

  return inputTypes.join("\n\n");
}

/**
 * Apply type prefixes to GraphQL schema to namespace types and avoid collisions.
 * Inlined from @powerhousedao/common/utils to avoid ES module import issues.
 * @param {string} schema - GraphQL schema string
 * @param {string} prefix - Prefix to apply to type names
 * @param {string[]} externalTypeNames - Type names from other schemas to also prefix
 * @returns {string} Schema with prefixed types
 */
function applyGraphQLTypePrefixes(
  schema: string,
  prefix: string,
  externalTypeNames: string[] = [],
): string {
  if (!schema || !schema.trim()) {
    return schema;
  }

  const doc = parseSdl(schema);
  const names = new Set([
    ...definedTypeNames(doc, ALL_PREFIX_KINDS),
    ...externalTypeNames,
  ]);
  if (names.size === 0) return schema;
  return print(prefixTypeNames(doc, prefix, names));
}

/** Reads the template inputs out of a schema-first model's stored SDL by regex. */
function storedModelProjection(
  documentModel: DocumentModelGlobalState,
  documentName: string,
): ModelProjection {
  const specification = documentModel.specifications.at(-1);
  const globalStateSchema = specification?.state.global.schema;
  const localStateSchema = specification?.state.local.schema;
  const stateTypeNames = [
    ...extractTypeNames(globalStateSchema ?? ""),
    ...extractTypeNames(localStateSchema ?? ""),
  ];
  const allOperationTypeNames =
    specification?.modules.flatMap((module) =>
      module.operations.flatMap((op) => extractTypeNames(op.schema ?? "")),
    ) ?? [];
  const allTypeNames = [
    ...new Set([...stateTypeNames, ...allOperationTypeNames]),
  ];

  const prefixedStateInputTypes = applyGraphQLTypePrefixes(
    extractInputTypeDefinitions(
      globalStateSchema ?? "",
      new Set(allOperationTypeNames),
    ),
    documentName,
    allTypeNames,
  );

  const operations =
    specification?.modules.flatMap((module) =>
      module.operations
        .filter((op) => op.name && hasValidSchema(op.schema))
        .map((op) => ({
          camelName: camelCase(op.name!),
          inputTypeName: `${documentName}_${pascalCase(op.name!)}Input`,
        })),
    ) ?? [];

  const modules =
    specification?.modules
      .filter((module) =>
        module.operations.some((op) => hasValidSchema(op.schema)),
      )
      .map((module) => ({
        name: module.name,
        sdl: module.operations
          .filter((op) => hasValidSchema(op.schema))
          .map((op) =>
            applyGraphQLTypePrefixes(
              op.schema ?? "",
              documentName,
              allTypeNames,
            ),
          )
          .join("\n  "),
      })) ?? [];

  // DocumentModel names its root `DocumentModelGlobalState`.
  const globalStateTypeName =
    documentName === "DocumentModel"
      ? `${documentName}_${documentName}GlobalState`
      : `${documentName}_${documentName}State`;
  const localStateTypeName = (localStateSchema ?? "").includes(
    `type ${documentName}LocalState`,
  )
    ? `${documentName}_${documentName}LocalState`
    : null;

  return {
    documentName,
    operations,
    modules,
    stateInputTypes: prefixedStateInputTypes,
    globalStateTypeName,
    localStateTypeName,
    initialState: storedInitialState(specification, documentName, allTypeNames),
  };
}

/** The new API's initial-state argument, read out of the stored scope SDL. */
function storedInitialState(
  specification: DocumentModelGlobalState["specifications"][0] | undefined,
  documentName: string,
  allTypeNames: string[],
): ModelProjection["initialState"] {
  const scopes: { name: string; type: string }[] = [];
  const generatedInputTypeParts: string[] = [];
  if (!specification) return { inputTypes: "", scopes };

  for (const [scopeName, scopeState] of Object.entries(specification.state)) {
    const schema = (scopeState as { schema?: string }).schema ?? "";
    if (!hasValidSchema(schema)) {
      scopes.push({ name: scopeName, type: "JSONObject" });
      continue;
    }
    const rootTypeName = extractRootTypeName(schema, documentName, scopeName);
    if (!rootTypeName) {
      scopes.push({ name: scopeName, type: "JSONObject" });
      continue;
    }
    const scopeInputTypes = generateStateInputTypes(
      schema,
      new Set(allTypeNames),
    );
    if (!scopeInputTypes) {
      scopes.push({ name: scopeName, type: "JSONObject" });
      continue;
    }
    scopes.push({
      name: scopeName,
      type: `${documentName}_${rootTypeName}Input`,
    });
    generatedInputTypeParts.push(
      applyGraphQLTypePrefixes(scopeInputTypes, documentName, allTypeNames),
    );
  }

  return { inputTypes: generatedInputTypeParts.join("\n\n"), scopes };
}

/**
 * Generates a document model's subgraph schema. Pass the module so a
 * code-first model is projected from its structured definition. A
 * schema-first caller may pass the stored global state instead.
 */
/**
 * The template output each model generated, so the host can tell
 * a model's own subgraph from a foreign one by identity. SDL content cannot
 * prove it, because any subgraph may declare the same type names.
 */
const templateOwners = new WeakMap<
  DocumentNode,
  ReadonlyMap<string, StringValueNode>
>();

export function generateDocumentModelSchema(
  source: DocumentModelSource,
  options: DocumentModelSchemaOptions = {},
): DocumentNode {
  const documentModel = globalStateOf(source);
  const documentName = getDocumentModelSchemaName(documentModel);
  const structured = isDocumentModelModule(source)
    ? structuredModelOf(source)
    : null;
  const document = generateModelSchema(
    structured === null
      ? storedModelProjection(documentModel, documentName)
      : structuredModelProjection(structured, documentName),
    options,
  );
  const descriptions = new Map<string, StringValueNode>();
  if (structured !== null) {
    const stateTypes = parseSdl(
      structuredModelStateTypes(
        structured,
        documentName,
        structured.hostDescriptions,
      ),
    );
    for (const def of stateTypes.definitions) {
      if (
        !("name" in def) ||
        def.name === undefined ||
        !("description" in def)
      ) {
        continue;
      }
      const key = `${def.kind}:${def.name.value}`;
      if (!descriptions.has(key) && def.description) {
        descriptions.set(key, def.description);
      }
    }
  }
  templateOwners.set(document, descriptions);
  return document;
}
