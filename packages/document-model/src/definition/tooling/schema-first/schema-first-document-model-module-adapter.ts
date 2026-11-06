import { DocumentModelGlobalStateSchema } from "@powerhousedao/shared/document-model";
import type {
  CompiledErrorDefinition,
  DefinitionExample,
  DefinitionPath,
  DefinitionSource,
  DocumentModelDefinition,
  DocumentModelGlobalState,
  DocumentModelModuleDefinition,
  DocumentModelOperationDefinition,
  DocumentModelPHState,
  DocumentModelSpecificationDefinition,
  DocumentSpecification,
  InputTypeDefinition,
  JsonValue,
  NamedGraphQLTypeDefinition,
  OperationSpecification,
  StateDefinition,
} from "@powerhousedao/shared/document-model";
import { scalarCatalog } from "../../../scalars/catalog.js";
import type { ScalarDefinition } from "../../../scalars/types.js";
import { serializeAndValidateInitialValue } from "../../compiler/initial-value.js";
import { scalarReferences } from "../../compiler/stored-scalar.js";
import {
  deriveDocumentModelNames,
  deriveDocumentModelSymbolNames,
} from "../../compiler/naming.js";
import { checkDocumentModelDefinitionShape } from "../../compiler/wire-shape.js";
import {
  rejectionReceived,
  snapshotRecord,
  snapshotDataRecord,
} from "../../kernel/data-properties.js";
import { DefinitionDiagnosticCollector } from "../../kernel/diagnostic-collector.js";
import { describeReceived } from "../../kernel/diagnostics.js";
import {
  canonicalDigest,
  EMPTY_INPUT_FIELD_NAME,
} from "../../kernel/primitives.js";
import type { NormalizedDocumentModelResult } from "../adapters/types.js";
import {
  type ToolingDiagnosticCode,
  toolingDiagnostics,
} from "../diagnostic-codes.js";
import {
  declaredTypeNames,
  type GraphQLDefinitionNode,
  referencedTypeNames,
  structuredTypes,
} from "../graphql/ast-to-structured.js";
import { parseSchema } from "../graphql/parse-schema.js";
import { storedStateDescriptor } from "./state-descriptor.js";

type Collector = DefinitionDiagnosticCollector<ToolingDiagnosticCode>;

/** @experimental Options for {@link adaptSchemaFirstDocumentModelModule}. */
export type SchemaFirstAdapterOptions = {
  readonly version?: number;

  readonly scalars?: readonly ScalarDefinition[];
};

const EXAMPLE_KEY_PREFIX = "schema-first-id:";

function producesRuntimeSymbol(name: unknown): name is string {
  if (typeof name !== "string" || name.trim() === "") return false;
  const { typeName, memberName, constantName } =
    deriveDocumentModelSymbolNames(name);
  return typeName !== "" && memberName !== "" && constantName !== "";
}

function blocked(
  collector: Collector,
  kind: "module" | "operation" | "error",
  value: unknown,
  path: DefinitionPath,
): undefined {
  const received =
    typeof value === "string" ? JSON.stringify(value) : String(value);
  collector.add({
    code: "PH-DM-DECLARATION-INVALID",
    path,
    message: `The stored ${kind} name ${received} never produced a runtime symbol, so there is no generated ${kind} to describe.`,
    expected: "a name with at least one letter or digit",
    received,
    repair: `Name the ${kind} in the document model editor and generate again.`,
  });
  return undefined;
}

function examples(
  stored: readonly { readonly id: string; readonly value: string }[],
): readonly DefinitionExample[] {
  return stored.map(({ id, value }) => ({
    id,
    key: `${EXAMPLE_KEY_PREFIX}${id}`,
    value,
  }));
}

function parseInitialValue(
  collector: Collector,
  stored: string,
  path: DefinitionPath,
  emptyIsObject: boolean,
): JsonValue | undefined {
  if (emptyIsObject && stored.trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    parsed = undefined;
  }
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as JsonValue;
  }
  collector.add({
    code: "PH-DM-INITIAL-VALUE-INVALID",
    path,
    message:
      "The stored initial value does not parse to a JSON object, so it cannot be the value its state root holds.",
    expected: "a JSON object, encoded once",
    received: stored,
    repair: "Store the scope's initial value as a JSON object.",
  });
  return undefined;
}

function emptyInputProjection(input: InputTypeDefinition): InputTypeDefinition {
  const [only] = input.fields;
  const empty =
    input.fields.length === 1 &&
    only.name === EMPTY_INPUT_FIELD_NAME &&
    only.type.kind === "scalar" &&
    only.type.name === "Boolean" &&
    !only.type.required;
  return empty ? { ...input, fields: [] } : input;
}

function modelScalarReferences(
  definitions: readonly GraphQLDefinitionNode[],
  scalars: readonly ScalarDefinition[],
): DocumentModelSpecificationDefinition["scalars"] {
  const used = new Set(referencedTypeNames(definitions));
  return scalarReferences(
    used,
    new Map(
      scalars
        .filter(({ name }) => used.has(name))
        .map((definition) => [definition.name, definition]),
    ),
  );
}

function normalizeOperation(
  collector: Collector,
  operation: OperationSpecification,
  typesByName: ReadonlyMap<string, NamedGraphQLTypeDefinition>,
  path: DefinitionPath,
): DocumentModelOperationDefinition | undefined {
  if (!producesRuntimeSymbol(operation.name)) {
    return blocked(collector, "operation", operation.name, [...path, "name"]);
  }
  if (operation.scope !== "global" && operation.scope !== "local") {
    collector.add({
      code: "PH-DM-SCOPE-UNSUPPORTED",
      path: [...path, "scope"],
      message: `Operation ${JSON.stringify(operation.name)} is stored in scope ${JSON.stringify(operation.scope)}, which a V1 definition cannot record.`,
      expected: "global | local",
      received: String(operation.scope),
      repair: "Store the operation in the global or local scope.",
    });
    return undefined;
  }
  const names = deriveDocumentModelSymbolNames(operation.name);
  const inputName = `${names.typeName}Input`;
  const hasSchema = operation.schema !== null && operation.schema.trim() !== "";
  const declared = hasSchema ? typesByName.get(inputName) : undefined;
  if (hasSchema && declared?.kind !== "input") {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: [...path, "schema"],
      message: `The stored schema of operation ${JSON.stringify(operation.name)} declares no input type ${inputName}, which codegen and the host read its input from.`,
      expected: `input ${inputName} { ... }`,
      received: declared === undefined ? "absent" : declared.kind,
      repair: `Declare input ${inputName} in the operation's schema.`,
    });
    return undefined;
  }
  const errors = operation.errors.map(
    (error, index): CompiledErrorDefinition | undefined =>
      producesRuntimeSymbol(error.name)
        ? {
            id: error.id,
            key: deriveDocumentModelSymbolNames(error.name).typeName,
            code: error.code,
            name: error.name,
            description: error.description,
            template: error.template,
          }
        : blocked(collector, "error", error.name, [
            ...path,
            "errors",
            index,
            "name",
          ]),
  );
  if (errors.includes(undefined)) return undefined;
  return {
    id: operation.id,
    key: names.memberName,
    name: operation.name,
    description: operation.description,
    actionType: names.constantName,
    creatorKey: names.memberName,
    scope: operation.scope,
    input: declared?.kind === "input" ? emptyInputProjection(declared) : null,
    errors: errors as readonly CompiledErrorDefinition[],
    examples: examples(operation.examples),
    template: operation.template,
    reducer: operation.reducer,
  };
}

function acceptedByRoot(
  collector: Collector,
  initialValue: JsonValue,
  root: string,
  types: {
    readonly byName: ReadonlyMap<string, NamedGraphQLTypeDefinition>;
    readonly scalars: readonly ScalarDefinition[];
  },
  path: DefinitionPath,
): boolean {
  const descriptor = storedStateDescriptor(types.byName, root, types.scalars);
  if (descriptor === undefined) return true;
  const checked = serializeAndValidateInitialValue(descriptor, initialValue);
  if (checked.ok) return true;
  collector.add({
    code: "PH-DM-INITIAL-VALUE-INVALID",
    path,
    message: `The ${root} schema rejects this initial value.`,
    expected: `a value ${root} accepts`,
    received: checked.message,
    repair:
      "Correct the stored initial value so the declared state schema accepts it.",
  });
  return false;
}

function rootState(
  collector: Collector,
  stored: DocumentSpecification["state"]["global"],
  root: string | null,
  path: DefinitionPath,
  scope: "global" | "local",
  types: {
    readonly byName: ReadonlyMap<string, NamedGraphQLTypeDefinition>;
    readonly scalars: readonly ScalarDefinition[];
  },
): StateDefinition | undefined {
  const initialValuePath = [...path, "initialValue"];
  const initialValue = parseInitialValue(
    collector,
    stored.initialValue,
    initialValuePath,
    scope === "local",
  );
  if (
    initialValue === undefined ||
    (root !== null &&
      !acceptedByRoot(collector, initialValue, root, types, initialValuePath))
  ) {
    return undefined;
  }
  const materialized = {
    initialValue: stored.initialValue,
    examples: stored.examples.map(({ id, value }) => ({ id, value })),
  };
  return root === null
    ? {
        root: null,
        initialValue: {},
        examples: examples(stored.examples),
        unknownKeys: "preserve",
        materialized: { ...materialized, schema: "" },
      }
    : {
        root: { kind: "named", name: root, required: true },
        initialValue,
        examples: examples(stored.examples),
        unknownKeys: "preserve",
        materialized: { ...materialized, schema: stored.schema },
      };
}

const BUILT_IN_SCALARS: ReadonlySet<string> = new Set([
  "ID",
  "String",
  "Boolean",
  "Int",
  "Float",
]);

const CATALOG_SCALARS: ReadonlySet<string> = new Set(
  scalarCatalog.map(({ name }) => name),
);

/**
 * Codegen imports every scalar a stored schema declares or uses from
 * scalars/index.ts unless it is built in or in the catalog. A missing export
 * would otherwise surface later as an error that never names it.
 */
function knownScalars(
  collector: Collector,
  segments: readonly {
    readonly path: DefinitionPath;
    readonly definitions: readonly GraphQLDefinitionNode[];
  }[],
  declared: ReadonlySet<string>,
  scalars: readonly ScalarDefinition[],
): boolean {
  const project = new Set(scalars.map(({ name }) => name));
  const reported = new Set<string>();
  for (const segment of segments) {
    const names = [
      ...referencedTypeNames(segment.definitions)
        .filter((name) => !declared.has(name))
        .map((name) => ({ name, verb: "uses" })),
      ...segment.definitions.flatMap((node) =>
        node.kind === "ScalarTypeDefinition"
          ? [{ name: node.name.value, verb: "declares" }]
          : [],
      ),
    ];
    for (const { name, verb } of names) {
      if (
        BUILT_IN_SCALARS.has(name) ||
        CATALOG_SCALARS.has(name) ||
        project.has(name) ||
        reported.has(name)
      ) {
        continue;
      }
      reported.add(name);
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: segment.path,
        message: `The stored schema ${verb} scalar ${name}, which is not a GraphQL built-in, a catalog scalar, or a project scalar exported from scalars/index.ts.`,
        expected: "a scalar defined with defineScalar in scalars/index.ts",
        received: name,
        repair: `Export ${name} from scalars/index.ts with defineScalar, or use a catalog scalar.`,
      });
    }
  }
  return reported.size === 0;
}

/** A specification's stored SDL strings, in the order its retained document concatenates them. */
export function storedSchemaSegments(
  specification: DocumentSpecification,
  path: DefinitionPath,
): readonly { readonly schema: string; readonly path: DefinitionPath }[] {
  return [
    {
      schema: specification.state.global.schema,
      path: [...path, "state", "global", "schema"],
    },
    {
      schema: specification.state.local.schema,
      path: [...path, "state", "local", "schema"],
    },
    ...specification.modules.flatMap((module, moduleIndex) =>
      module.operations.map((operation, operationIndex) => ({
        schema: operation.schema ?? "",
        path: [
          ...path,
          "modules",
          moduleIndex,
          "operations",
          operationIndex,
          "schema",
        ],
      })),
    ),
  ];
}

function normalizeSpecification(
  collector: Collector,
  specification: DocumentSpecification,
  roots: { readonly global: string; readonly local: string },
  path: DefinitionPath,
  scalars: readonly ScalarDefinition[],
): DocumentModelSpecificationDefinition | undefined {
  const segments = storedSchemaSegments(specification, path);
  const parsedSegments: {
    readonly path: DefinitionPath;
    readonly definitions: readonly GraphQLDefinitionNode[];
  }[] = [];
  for (const segment of segments) {
    const parsed = parseSchema(segment.schema);
    if (!parsed.ok) {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: segment.path,
        message: `The stored schema is not GraphQL SDL: ${parsed.message}`,
        expected: "GraphQL SDL",
        received: segment.schema,
        repair: "Fix the schema in the document model editor.",
      });
      return undefined;
    }
    parsedSegments.push({
      path: segment.path,
      definitions: parsed.document.definitions,
    });
  }
  const definitions = parsedSegments.flatMap((segment) => segment.definitions);
  const declared = declaredTypeNames(definitions);
  if (!knownScalars(collector, parsedSegments, declared, scalars)) {
    return undefined;
  }
  const allTypes = structuredTypes(definitions, declared);
  const typesByName: ReadonlyMap<string, NamedGraphQLTypeDefinition> = new Map(
    allTypes.map((type) => [type.name, type]),
  );

  const hasLocalRoot = specification.state.local.schema.trim() !== "";
  for (const scope of ["global", "local"] as const) {
    if (scope === "local" && !hasLocalRoot) continue;
    if (typesByName.get(roots[scope])?.kind !== "object") {
      collector.add({
        code: "PH-DM-STATE-ROOT-INVALID",
        path: [...path, "state", scope, "schema"],
        message: `The stored ${scope} state schema declares no object type named ${roots[scope]}.`,
        expected: `type ${roots[scope]} { ... }`,
        received: [...typesByName.keys()].join(", "),
        repair: `Name the ${scope} state root after the model; every consumer resolves it by that name.`,
      });
      return undefined;
    }
  }

  const modules: DocumentModelModuleDefinition[] = [];
  for (const [moduleIndex, module] of specification.modules.entries()) {
    const modulePath = [...path, "modules", moduleIndex];
    if (!producesRuntimeSymbol(module.name)) {
      return blocked(collector, "module", module.name, [...modulePath, "name"]);
    }
    const operations = module.operations.map((operation, operationIndex) =>
      normalizeOperation(collector, operation, typesByName, [
        ...modulePath,
        "operations",
        operationIndex,
      ]),
    );
    if (operations.includes(undefined)) return undefined;
    modules.push({
      id: module.id,
      key: deriveDocumentModelSymbolNames(module.name).memberName,
      name: module.name,
      description: module.description,
      operations: operations as readonly DocumentModelOperationDefinition[],
    });
  }

  const global = rootState(
    collector,
    specification.state.global,
    roots.global,
    [...path, "state", "global"],
    "global",
    { byName: typesByName, scalars },
  );
  const local = rootState(
    collector,
    specification.state.local,
    hasLocalRoot ? roots.local : null,
    [...path, "state", "local"],
    "local",
    { byName: typesByName, scalars },
  );
  if (global === undefined || global.root === null || local === undefined) {
    return undefined;
  }

  const inputs = new Set(
    modules.flatMap((module) =>
      module.operations.flatMap((operation) =>
        operation.input === null ? [] : [operation.input.name],
      ),
    ),
  );
  return {
    version: specification.version,
    scalars: modelScalarReferences(definitions, scalars),
    graphQLCompatibility: {
      kind: "graphql-ast-v1",
      document: { kind: "Document", definitions },
      preserveDefinitionOrder: true,
    },
    types: allTypes.filter((type) => !inputs.has(type.name)),
    state: { global, local },
    modules,
    changeLog: [...specification.changeLog],
  };
}

type StoredModel = {
  readonly global: DocumentModelGlobalState;
  readonly documentModel: DocumentModelPHState;
  readonly version: number;
};

function storedModel(
  collector: Collector,
  value: unknown,
  options: SchemaFirstAdapterOptions,
): StoredModel | undefined {
  const root = snapshotRecord(value, undefined, []);
  const module =
    root.ok && root.value.documentModel !== undefined ? root.value : undefined;
  const documentModel = module === undefined ? value : module.documentModel;
  const path = module === undefined ? [] : ["documentModel"];
  const state = snapshotRecord(documentModel, undefined, path);
  const global = state.ok
    ? snapshotDataRecord(state.value.global, undefined, [...path, "global"])
    : state;
  if (!global.ok) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: global.path,
      message: `This export is neither a generated document-model module nor its stored state (${global.reason}).`,
      expected: "a module with documentModel.global, or a DocumentModelPHState",
      received: rejectionReceived(global),
      repair: "Pass the module ph generate produced, or its documentModel.",
    });
    return undefined;
  }
  const parsed = DocumentModelGlobalStateSchema().safeParse(global.value);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: [
          ...path,
          "global",
          ...issue.path.map((segment) =>
            typeof segment === "symbol" ? String(segment) : segment,
          ),
        ],
        message: issue.message,
        expected: "a stored document model matching DocumentModelGlobalState",
        received: "a malformed stored model",
        repair:
          "Pass the module ph generate produced, or its stored documentModel.",
      });
    }
    return undefined;
  }
  const declared: unknown = options.version ?? module?.version ?? 1;
  if (
    typeof declared !== "number" ||
    !Number.isSafeInteger(declared) ||
    declared <= 0
  ) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["version"],
      message: "A module's registry version is a positive safe integer.",
      expected: "a positive safe integer",
      received:
        typeof declared === "number"
          ? String(declared)
          : describeReceived(declared),
      repair: "Pass the version this module registers.",
    });
    return undefined;
  }
  return {
    global: parsed.data,
    documentModel: documentModel as DocumentModelPHState,
    version: declared,
  };
}

/**
 * @experimental Normalizes one generated schema-first module, or one stored
 * `DocumentModelPHState`, into the V1 wire shape. A model it cannot
 * normalize is reported in `diagnostics`; the stored members it trusts are
 * the ones `ph generate` writes. Experimental: it exists so code-first and
 * schema-first models can be read through one shape while code-first
 * projects are introduced.
 */
export function adaptSchemaFirstDocumentModelModule(
  value: unknown,
  source: DefinitionSource,
  options: SchemaFirstAdapterOptions = {},
): NormalizedDocumentModelResult {
  const probe: Collector = new DefinitionDiagnosticCollector(
    toolingDiagnostics,
  );
  const stored = storedModel(probe, value, options);
  if (stored === undefined) {
    return {
      artifacts: [],
      upgradeManifest: null,
      diagnostics: probe.diagnostics,
    };
  }
  const { global, version } = stored;
  const collector: Collector = new DefinitionDiagnosticCollector(
    toolingDiagnostics,
    { kind: "document-model", key: global.id, version },
  );
  const failed = (): NormalizedDocumentModelResult => ({
    artifacts: [],
    upgradeManifest: null,
    diagnostics: collector.diagnostics,
  });
  const names = deriveDocumentModelNames({ id: global.id, name: global.name });
  const specifications = global.specifications.map((specification, index) =>
    normalizeSpecification(
      collector,
      specification,
      { global: names.globalStateRootName, local: names.localStateRootName },
      ["specifications", index],
      options.scalars ?? [],
    ),
  );
  if (specifications.includes(undefined)) return failed();

  const definition: DocumentModelDefinition = {
    kind: "powerhouse.document-model",
    formatVersion: 1,
    compatibility: {
      identity: "explicit-schema-first",
      scalarCoercion: "catalog-v1",
      serialization: "explicit-schema-first",
    },
    model: {
      documentType: global.id,
      graphQLName: names.graphQLName,
      name: global.name,
      description: global.description,
      extension: global.extension,
      author: { name: global.author.name, website: global.author.website },
    },
    specifications: specifications as DocumentModelSpecificationDefinition[],
  };
  const shape = checkDocumentModelDefinitionShape(definition);
  collector.merge(shape);
  if (shape.length > 0) return failed();
  if (!definition.specifications.some((entry) => entry.version === version)) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["specifications"],
      message: `The stored history carries no version ${version}, which is the version this module serves.`,
      expected: `a specification for version ${version}`,
      received: definition.specifications
        .map((entry) => String(entry.version))
        .join(", "),
      repair:
        "Pass the version this module registers, or the module that serves a stored version.",
    });
    return failed();
  }
  return {
    artifacts: [
      {
        kind: "powerhouse.document-model-artifact",
        source,
        documentType: global.id,
        version,
        definition,
        digest: canonicalDigest(definition),
        documentModel: stored.documentModel,
      },
    ],
    upgradeManifest: null,
    diagnostics: collector.diagnostics,
  };
}
