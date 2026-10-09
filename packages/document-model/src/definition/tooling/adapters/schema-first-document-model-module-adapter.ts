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
  LocationFreeGraphQLDocumentNode,
  ModuleSpecification,
  NamedGraphQLTypeDefinition,
  NonEmptyStateDefinition,
  OperationSpecification,
  SchemaFirstGraphQLDocumentCompatibility,
  StateDefinition,
  TypeReferenceDefinition,
} from "@powerhousedao/shared/document-model";
import { identityVectorsOf } from "../../adapters/identity-vectors.js";
import type {
  NormalizedDocumentModelArtifact,
  NormalizedDocumentModelResult,
} from "../../adapters/types.js";
import { snapshotRecord } from "../../data-properties.js";
import { DefinitionDiagnosticCollector } from "../../diagnostics.js";
import {
  checkDerivedNameCollisions,
  type DerivedModuleNames,
  type DerivedOperationNames,
  deriveDocumentModelModuleNames,
  deriveDocumentModelNames,
  deriveSchemaFirstErrorKey,
  deriveSchemaFirstModuleKey,
  deriveSchemaFirstOperationNames,
  producesRuntimeSymbol,
} from "../../naming.js";
import {
  canonicalDigest,
  canonicalJson,
  EMPTY_INPUT_FIELD_NAME,
} from "../../primitives.js";
import { namedTypeInventory, printSchemaSegment } from "../../printer.js";
import { assignStoredSegments } from "../../segments.js";
import { scalarCatalog } from "../../scalars/catalog.js";
import { checkDocumentModelDefinitionShape } from "../../wire-shape.js";
import {
  checkScalarReferences,
  declaredTypeNames,
  EMPTY_DOCUMENT,
  structuredTypesBySegment,
  structuredTypesFromDocument,
} from "../ast-to-structured.js";
import { schemaFirstGraphQLDocument } from "../graphql-document.js";
import { generatedDifference, mergedDeclaration } from "../codegen-merge.js";

/**
 * Projects the state a generated `DocumentModelModule` already carries into
 * the same normalized structured definition the code-first compiler produces.
 *
 * This is the backward-compatibility keystone. If it is wrong, the parity
 * tests compare the wrong thing and prove nothing. Two rules keep it honest:
 *
 * - **Preserve, do not derive.** Stored module and operation names, error
 *   metadata, examples, templates, and the specification order are copied
 *   exactly, including `null` versus `""`. Only the values the current
 *   generator itself derives from a stored name — the action type, the
 *   creator key, the input type name — are derived here, from that same
 *   stored name.
 * - **Blocked, not invented.** A stored value that never produced a usable
 *   runtime symbol stops normalization for that model and keeps its original
 *   value in the diagnostic. The adapter never substitutes a replacement.
 *
 * It lives behind the `document-model/tooling` export because it parses SDL.
 * The runtime GraphQL host keeps its own schema-first SDL adapter, and its
 * output is never attached to a schema-first runtime module as `definition`.
 */

/** The prefix that turns a stored opaque example ID into a stable compiler key. */
export const SCHEMA_FIRST_EXAMPLE_KEY_PREFIX = "schema-first-id:";

export type SchemaFirstAdapterOptions = {
  /**
   * The registry version this module serves. The registry's current default
   * of 1 is retained when a module omits the optional property.
   */
  readonly version?: number;
};

type StoredModel = {
  readonly global: DocumentModelGlobalState;
  readonly documentModel: DocumentModelPHState;
  readonly version: number;
};

function storedModel(
  collector: DefinitionDiagnosticCollector,
  value: unknown,
  options: SchemaFirstAdapterOptions,
): StoredModel | undefined {
  const root = snapshotRecord(value, undefined, []);
  if (!root.ok) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: root.path,
      message: `This export is neither a document-model module nor a stored document-model state (${root.reason}).`,
      expected: "a module with documentModel, or a DocumentModelPHState",
      received: value === null ? "null" : typeof value,
      repair:
        "Export the generated module, or pass its documentModel state directly.",
    });
    return undefined;
  }
  const isModule = root.value.documentModel !== undefined;
  const documentModel = (
    isModule ? root.value.documentModel : value
  ) as DocumentModelPHState;
  const state = snapshotRecord(documentModel, undefined, ["documentModel"]);
  const global =
    state.ok === true
      ? snapshotRecord(state.value.global, undefined, [
          "documentModel",
          "global",
        ])
      : undefined;
  if (global?.ok !== true || !Array.isArray(global.value.specifications)) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["documentModel", "global", "specifications"],
      message: "A stored document model carries a specification history.",
      expected: "documentModel.global.specifications",
      received: typeof global?.ok,
      repair: "Pass the module produced by ph generate, or its stored state.",
    });
    return undefined;
  }
  const declared = isModule ? root.value.version : undefined;
  const version = options.version ?? (declared as number | undefined) ?? 1;
  return {
    global: global.value as unknown as DocumentModelGlobalState,
    documentModel,
    version,
  };
}

function blockedName(
  collector: DefinitionDiagnosticCollector,
  what: string,
  name: string | null,
  path: DefinitionPath,
): void {
  collector.add({
    code: "PH-DM-DECLARATION-INVALID",
    path,
    message: `Stored ${what} name ${name === null ? "null" : JSON.stringify(name)} never produced a runtime symbol, so this model cannot be normalized.`,
    expected: "a stored name the current generator can turn into a symbol",
    received: name === null ? "null" : JSON.stringify(name),
    repair: `Give the ${what} a name in the model before converting it; the adapter does not invent one.`,
  });
}

function exampleKeys(
  collector: DefinitionDiagnosticCollector,
  examples: readonly { readonly id: string; readonly value: string }[],
  path: DefinitionPath,
): readonly DefinitionExample[] {
  const seen = new Map<string, number>();
  return examples.map((example, index) => {
    const first = seen.get(example.id);
    if (first !== undefined) {
      collector.add({
        code: "PH-DM-IDENTITY-INVALID",
        path: [...path, index, "id"],
        message: `Two examples share the stored ID ${JSON.stringify(example.id)}, so neither can take a stable key from it.`,
        expected: "one stored ID per example",
        received: example.id,
        repair:
          "Give each example a distinct semantic key in the compatibility map; the adapter never derives a key from array position.",
        related: [
          { path: [...path, first, "id"], message: "First used here." },
        ],
      });
    }
    seen.set(example.id, index);
    return {
      id: example.id,
      key: `${SCHEMA_FIRST_EXAMPLE_KEY_PREFIX}${example.id}`,
      value: example.value,
    };
  });
}

/**
 * `_empty: Boolean` is how the current generator spells an empty input
 * (`codegen/src/file-builders/document-model/utils.ts`), and how the printer
 * projects one. An input that carries only that member is an empty input, so
 * it normalizes to the same zero-field node a code-first `ph.input({ fields:
 * {} })` produces — otherwise the two approaches would describe one operation
 * two ways.
 */
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

/** Walks the type graph the way the compiler does, so the order matches. */
class TypeOrder {
  readonly ordered: NamedGraphQLTypeDefinition[] = [];
  readonly #index: ReadonlyMap<string, NamedGraphQLTypeDefinition>;
  readonly #seen = new Set<string>();

  constructor(index: ReadonlyMap<string, NamedGraphQLTypeDefinition>) {
    this.#index = index;
  }

  get seen(): ReadonlySet<string> {
    return this.#seen;
  }

  visit(
    name: string | undefined,
    options: { readonly emit?: boolean } = {},
  ): void {
    if (name === undefined || this.#seen.has(name)) return;
    const definition = this.#index.get(name);
    if (definition === undefined) return;
    this.#seen.add(name);
    if (options.emit !== false) this.ordered.push(definition);
    this.#children(definition);
  }

  #children(definition: NamedGraphQLTypeDefinition): void {
    switch (definition.kind) {
      case "enum":
        return;
      case "union":
        definition.members.forEach((member) => this.visit(member));
        return;
      case "object":
      case "interface":
        definition.implements?.forEach((entry) => this.visit(entry));
        for (const field of definition.fields) {
          field.args?.forEach((argument) =>
            this.visit(referencedName(argument.type)),
          );
          this.visit(referencedName(field.type));
        }
        return;
      case "input":
        for (const field of definition.fields) {
          this.visit(referencedName(field.type));
        }
    }
  }
}

function referencedName(
  reference: TypeReferenceDefinition,
): string | undefined {
  if (reference.kind === "list") return referencedName(reference.item);
  return reference.kind === "named" ? reference.name : undefined;
}

function scalarNamesIn(
  types: readonly NamedGraphQLTypeDefinition[],
): ReadonlySet<string> {
  const names = new Set<string>();
  const visit = (reference: TypeReferenceDefinition): void => {
    if (reference.kind === "list") {
      visit(reference.item);
      return;
    }
    if (reference.kind === "scalar") names.add(reference.name);
  };
  for (const type of types) {
    if (type.kind === "enum" || type.kind === "union") continue;
    for (const field of type.fields) {
      visit(field.type);
      if ("args" in field)
        field.args?.forEach((argument) => visit(argument.type));
    }
  }
  return names;
}

const TYPE_KEYWORDS: Readonly<
  Record<NamedGraphQLTypeDefinition["kind"], string>
> = {
  object: "type",
  interface: "interface",
  input: "input",
  enum: "enum",
  union: "union",
};

function divergentRepeat(
  collector: DefinitionDiagnosticCollector,
  kept: NamedGraphQLTypeDefinition,
  kinds: ReadonlySet<NamedGraphQLTypeDefinition["kind"]>,
  merged:
    | { readonly type: NamedGraphQLTypeDefinition }
    | { readonly error: string },
  path: DefinitionPath,
): void {
  const name = kept.name;
  const extend = `\`extend ${TYPE_KEYWORDS[kept.kind]} ${name}\``;
  if ("error" in merged) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path,
      message: `${name} is declared more than once in the stored schemas, and code generation cannot merge the declarations. ${merged.error}.`,
      expected: `declarations of ${name} that code generation can merge`,
      received: canonicalJson(kept),
      repair: `Make every declaration of ${name} agree on each member's type, or declare ${name} once and add the rest with ${extend}.`,
    });
    return;
  }
  collector.add({
    code: "PH-DM-DECLARATION-INVALID",
    path,
    message: `${name} is declared more than once in the stored schemas, and the type code generation merges from them validates differently: ${generatedDifference(merged.type, kept)}.`,
    expected: canonicalJson(merged.type),
    received: canonicalJson(kept),
    repair:
      kinds.size > 1
        ? "Rename one of the types; one name holds one type."
        : `Declare ${name} once and add the rest with ${extend}, or make every declaration of ${name} agree.`,
  });
}

function storedRepeatsMatchCodegenMerge(
  collector: DefinitionDiagnosticCollector,
  emitted: readonly NamedGraphQLTypeDefinition[],
  documents: readonly LocationFreeGraphQLDocumentNode[],
  typesBySegment: readonly (readonly NamedGraphQLTypeDefinition[])[],
  segmentPaths: readonly DefinitionPath[],
  declared: ReadonlySet<string>,
  schemaPath: DefinitionPath,
): boolean {
  let matches = true;
  for (const kept of emitted) {
    const copies = typesBySegment.flatMap((types, index) =>
      types
        .filter((type) => type.name === kept.name)
        .map((type) => ({ kind: type.kind, path: segmentPaths[index] })),
    );
    if (copies.length < 2) continue;
    const merged = mergedDeclaration(
      documents,
      kept.name,
      declared,
      schemaPath,
    );
    if (
      "type" in merged &&
      generatedDifference(merged.type, kept) === undefined
    ) {
      continue;
    }
    divergentRepeat(
      collector,
      kept,
      new Set(copies.map((copy) => copy.kind)),
      merged,
      [...copies[0].path, kept.name],
    );
    matches = false;
  }
  return matches;
}

type NormalizedOperation = {
  /** `${moduleKey}/${operationKey}`, the key its stored segment is filed by. */
  readonly key: string;
  readonly definition: DocumentModelOperationDefinition;
  readonly supporting: readonly NamedGraphQLTypeDefinition[];
  readonly inputName: string | undefined;
  readonly storedSchema: string | null;
};

function normalizeOperation(
  collector: DefinitionDiagnosticCollector,
  operation: OperationSpecification,
  moduleKey: string,
  typesByName: ReadonlyMap<string, NamedGraphQLTypeDefinition>,
  segmentTypes: readonly NamedGraphQLTypeDefinition[],
  path: DefinitionPath,
): NormalizedOperation | undefined {
  if (!producesRuntimeSymbol(operation.name)) {
    blockedName(collector, "operation", operation.name, [...path, "name"]);
    return undefined;
  }
  if (operation.scope !== "global" && operation.scope !== "local") {
    // A stored scope outside the two model scopes has no V1 representation,
    // and the runtime does not treat it as global — the replay corpus shows
    // an unknown scope keeping its own state. Rewriting it here would
    // persist a different scope than the model stores.
    collector.add({
      code: "PH-DM-SCOPE-UNSUPPORTED",
      path: [...path, "scope"],
      message: `Operation ${JSON.stringify(operation.name)} is stored in scope ${JSON.stringify(operation.scope)}, which a V1 definition cannot record.`,
      expected: "global | local",
      received: operation.scope,
      repair:
        "Store the operation in the global or local scope; the adapter does not reassign one.",
    });
    return undefined;
  }
  const storedName = operation.name;
  // The current generator derives the action type, the creator key, and the
  // input type name from the stored name. The logical key is that creator
  // key, which is the key a code-first author writes for the same operation.
  const names = deriveSchemaFirstOperationNames(storedName);
  const inputName = names.inputTypeName;
  const declared =
    operation.schema === null ? undefined : typesByName.get(inputName);
  const input =
    declared !== undefined && declared.kind === "input"
      ? emptyInputProjection(declared)
      : undefined;
  if (operation.schema !== null && input === undefined) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: [...path, "schema"],
      message:
        declared === undefined
          ? `No stored schema defines ${inputName}, the input type of operation ${JSON.stringify(storedName)}.`
          : `${inputName}, the input type of operation ${JSON.stringify(storedName)}, is declared with \`${TYPE_KEYWORDS[declared.kind]}\`, not \`input\`.`,
      expected: `input ${inputName} { ... }`,
      received: [...typesByName.values()]
        .filter((type) => type.kind === "input")
        .map((type) => type.name)
        .join(", "),
      repair:
        declared === undefined
          ? `Declare input ${inputName} in the operation's schema, or rename its input to ${inputName}; codegen and the host both look the input up by the name derived from the operation.`
          : `Declare ${inputName} with \`input\`; codegen and the host both read the operation's input from it.`,
    });
    return undefined;
  }

  const errors = operation.errors.map(
    (error, errorIndex): CompiledErrorDefinition | undefined => {
      if (!producesRuntimeSymbol(error.name)) {
        // The generator derives the error class, its `errorCode`, and its
        // default message from `pascalCase(name)`; without a name there is no
        // class to be equivalent to.
        blockedName(collector, "error", error.name, [
          ...path,
          "errors",
          errorIndex,
          "name",
        ]);
        return undefined;
      }
      return {
        id: error.id,
        key: deriveSchemaFirstErrorKey(error.name),
        code: error.code,
        name: error.name,
        description: error.description,
        template: error.template,
      };
    },
  );
  if (errors.some((error) => error === undefined)) return undefined;

  return {
    key: `${moduleKey}/${names.key}`,
    definition: {
      id: operation.id,
      key: names.key,
      name: operation.name,
      description: operation.description,
      actionType: names.actionType,
      creatorKey: names.creatorKey,
      scope: operation.scope,
      input: input ?? null,
      errors: errors as readonly CompiledErrorDefinition[],
      examples: exampleKeys(collector, operation.examples, [
        ...path,
        "examples",
      ]),
      template: operation.template,
      reducer: operation.reducer,
    },
    supporting: segmentTypes.filter((type) => type.name !== inputName),
    inputName: input === undefined ? undefined : inputName,
    storedSchema: operation.schema,
  };
}

type NormalizedSpecification = {
  readonly specification: DocumentModelSpecificationDefinition;
  /** True when canonical printing does not reproduce every stored string. */
  readonly retainsSerialization: boolean;
};

function normalizeSpecification(
  collector: DefinitionDiagnosticCollector,
  specification: DocumentSpecification,
  names: {
    readonly model: string;
    readonly global: string;
    readonly local: string;
  },
  path: DefinitionPath,
): NormalizedSpecification | undefined {
  const storedSegments = [
    {
      schema: specification.state.global.schema,
      key: "global",
      path: [...path, "state", "global", "schema"],
    },
    {
      schema: specification.state.local.schema,
      key: "local",
      path: [...path, "state", "local", "schema"],
    },
    ...specification.modules.flatMap((module, moduleIndex) =>
      module.operations.flatMap((operation, operationIndex) =>
        operation.schema === null
          ? []
          : [
              {
                schema: operation.schema,
                key: `${moduleIndex}/${operationIndex}`,
                path: [
                  ...path,
                  "modules",
                  moduleIndex,
                  "operations",
                  operationIndex,
                  "schema",
                ],
              },
            ],
      ),
    ),
  ];
  const document = collector.capture(() =>
    schemaFirstGraphQLDocument(storedSegments.map(({ schema }) => schema)),
  );
  if (document === undefined) return undefined;
  const declared = declaredTypeNames(document.document);

  const parsedSegments = storedSegments.map(({ schema, path: at }) => {
    if (schema.trim() === "") {
      return { document: EMPTY_DOCUMENT, unrepresentable: false };
    }
    const parsed = collector.capture(() =>
      schemaFirstGraphQLDocument([schema]),
    );
    if (parsed === undefined) {
      return { document: EMPTY_DOCUMENT, unrepresentable: true };
    }
    return {
      document: parsed.document,
      unrepresentable:
        structuredTypesFromDocument(parsed.document, declared, at)
          .unrepresentable.length > 0,
    };
  });
  const composed = structuredTypesBySegment(
    parsedSegments.map((segment) => segment.document),
    declared,
    [...path, "schema"],
  );
  if (composed.diagnostics.length > 0) {
    collector.merge(composed.diagnostics);
    return undefined;
  }
  const segmentAt = (index: number) => ({
    types: composed.types[index],
    unrepresentable: parsedSegments[index].unrepresentable,
  });
  const segments = new Map(
    storedSegments.map(({ key }, index) => [key, segmentAt(index)]),
  );
  const noSegment = { types: [], unrepresentable: false };
  const globalSegment = segmentAt(0);
  const localSegment = segmentAt(1);
  let unrepresentable =
    globalSegment.unrepresentable || localSegment.unrepresentable;

  const typesByName = new Map<string, NamedGraphQLTypeDefinition>();
  for (const type of [...globalSegment.types, ...localSegment.types]) {
    typesByName.set(type.name, type);
  }
  const declaredAnywhere = new Map(
    composed.types.flat().map((type) => [type.name, type] as const),
  );
  const operations: NormalizedOperation[] = [];
  const modules: DocumentModelModuleDefinition[] = [];
  const derivedNames: DerivedModuleNames[] = [];
  /** Names or operations that stopped normalization for this specification. */
  const blockedPaths: DefinitionPath[] = [];
  specification.modules.forEach((module: ModuleSpecification, moduleIndex) => {
    const modulePath = [...path, "modules", moduleIndex];
    if (!producesRuntimeSymbol(module.name)) {
      blockedName(collector, "module", module.name, [...modulePath, "name"]);
      blockedPaths.push([...modulePath, "name"]);
      return;
    }
    const moduleOperations: DocumentModelOperationDefinition[] = [];
    const derivedOperations: DerivedOperationNames[] = [];
    module.operations.forEach((operation, operationIndex) => {
      const operationPath = [...modulePath, "operations", operationIndex];
      const segment =
        segments.get(`${moduleIndex}/${operationIndex}`) ?? noSegment;
      unrepresentable = unrepresentable || segment.unrepresentable;
      for (const type of segment.types) typesByName.set(type.name, type);
      const normalized = normalizeOperation(
        collector,
        operation,
        deriveSchemaFirstModuleKey(module.name),
        new Map([...declaredAnywhere, ...typesByName]),
        segment.types,
        operationPath,
      );
      if (normalized === undefined) {
        blockedPaths.push(operationPath);
        return;
      }
      operations.push(normalized);
      moduleOperations.push(normalized.definition);
      derivedOperations.push({
        key: normalized.definition.key,
        names: deriveSchemaFirstOperationNames(operation.name as string),
      });
    });
    const moduleKey = deriveSchemaFirstModuleKey(module.name);
    derivedNames.push({
      key: moduleKey,
      names: deriveDocumentModelModuleNames(names.model, moduleKey, {
        storedName: module.name,
      }),
      operations: derivedOperations,
    });
    modules.push({
      id: module.id,
      key: moduleKey,
      name: module.name,
      description: module.description,
      operations: moduleOperations,
    });
  });
  if (blockedPaths.length > 0) return undefined;

  // A stored specification can carry two operations that derive one action
  // type. The generated `switch` would be first-match-wins and a code-first
  // table last-write-wins, so neither approach may normalize it: the same
  // check runs on both sides, over the complete model rather than per module.
  const collisions = checkDerivedNameCollisions(derivedNames);
  if (collisions.length > 0) {
    collector.merge(
      collisions.map((diagnostic) => ({
        ...diagnostic,
        path: [...path, ...diagnostic.path],
      })),
    );
    return undefined;
  }

  // The compiler emits a named type on first encounter walking the global
  // root, the local root, the auxiliary inventory, and then each operation.
  // Reproducing that order here is what makes the two structured definitions
  // comparable at all.
  const order = new TypeOrder(typesByName);
  order.visit(names.global);
  order.visit(names.local);
  for (const type of [...globalSegment.types, ...localSegment.types]) {
    order.visit(type.name);
  }
  for (const operation of operations) {
    order.visit(operation.inputName, { emit: false });
    for (const type of operation.supporting) order.visit(type.name);
  }

  const globalRoot = typesByName.get(names.global);
  if (globalRoot === undefined || globalRoot.kind !== "object") {
    collector.add({
      code: "PH-DM-STATE-ROOT-INVALID",
      path: [...path, "state", "global", "schema"],
      message: `The stored global state schema declares no object type named ${names.global}.`,
      expected: `type ${names.global} { ... }`,
      received: [...typesByName.keys()].join(", "),
      repair:
        "Name the global state root after the model; every consumer resolves it by that name.",
    });
    return undefined;
  }
  const localRoot = typesByName.get(names.local);
  if (
    specification.state.local.schema.trim() !== "" &&
    (localRoot === undefined || localRoot.kind !== "object")
  ) {
    collector.add({
      code: "PH-DM-STATE-ROOT-INVALID",
      path: [...path, "state", "local", "schema"],
      message: `The stored local state schema declares no object type named ${names.local}.`,
      expected: `type ${names.local} { ... }`,
      received: [...typesByName.keys()].join(", "),
      repair:
        "Name the local state root after the model, or store an empty local schema.",
    });
    return undefined;
  }

  const emitted = [
    ...order.ordered,
    ...operations.flatMap((operation) =>
      operation.definition.input === null ? [] : [operation.definition.input],
    ),
  ];
  if (!checkScalarReferences(collector, emitted, [...path, "types"])) {
    return undefined;
  }

  if (
    !storedRepeatsMatchCodegenMerge(
      collector,
      emitted,
      parsedSegments.map((segment) => segment.document),
      composed.types,
      storedSegments.map((segment) => segment.path),
      declared,
      [...path, "schema"],
    )
  ) {
    return undefined;
  }

  const globalInitial = parseInitialValue(
    collector,
    specification.state.global.initialValue,
    [...path, "state", "global", "initialValue"],
    { emptyIsObject: false },
  );
  const localInitial = parseInitialValue(
    collector,
    specification.state.local.initialValue,
    [...path, "state", "local", "initialValue"],
    // Code generation already reads an empty stored local value as `{}`
    // (`codegen/src/utils/unsafe-utils.ts`).
    { emptyIsObject: true },
  );
  if (globalInitial === undefined || localInitial === undefined)
    return undefined;

  const globalExamples = exampleKeys(
    collector,
    specification.state.global.examples,
    [...path, "state", "global", "examples"],
  );
  const localExamples = exampleKeys(
    collector,
    specification.state.local.examples,
    [...path, "state", "local", "examples"],
  );

  const global: NonEmptyStateDefinition = {
    root: { kind: "named", name: names.global, required: true },
    initialValue: globalInitial,
    examples: globalExamples,
    unknownKeys: "preserve",
    materialized: {
      schema: specification.state.global.schema,
      initialValue: specification.state.global.initialValue,
      examples: globalExamples.map(({ id, value }) => ({ id, value })),
    },
  };
  const local: StateDefinition =
    localRoot === undefined
      ? {
          root: null,
          initialValue: {},
          examples: localExamples,
          unknownKeys: "preserve",
          materialized: {
            schema: "",
            initialValue: specification.state.local.initialValue,
            examples: localExamples.map(({ id, value }) => ({ id, value })),
          },
        }
      : {
          root: { kind: "named", name: names.local, required: true },
          initialValue: localInitial,
          examples: localExamples,
          unknownKeys: "preserve",
          materialized: {
            schema: specification.state.local.schema,
            initialValue: specification.state.local.initialValue,
            examples: localExamples.map(({ id, value }) => ({ id, value })),
          },
        };

  // Canonical printing either reproduces every stored string or it does not;
  // a difference is retained as a serialization override, never silently
  // accepted. A difference alone does not select the AST projection.
  const retainsSerialization = printedDiffers(
    specification,
    operations,
    order.ordered,
    names,
    { global: globalInitial, local: localInitial },
  );

  // An operation's own input stays on its operation node rather than in the
  // inventory, so the scalar walk has to be handed both.
  const scalars = scalarNamesIn([
    ...order.ordered,
    ...operations.flatMap((operation) =>
      operation.definition.input === null ? [] : [operation.definition.input],
    ),
  ]);
  return {
    specification: {
      version: specification.version,
      scalars: scalarCatalog.names
        .filter((name) => scalars.has(name))
        .map((name) => ({
          name,
          implementation: `powerhouse.catalog#${name}` as const,
          coercionProfile: "document-engineering-1.40" as const,
        })) as DocumentModelSpecificationDefinition["scalars"],
      graphQLCompatibility: unrepresentable
        ? (document as SchemaFirstGraphQLDocumentCompatibility)
        : null,
      types: order.ordered,
      state: { global, local },
      modules,
      changeLog: [...specification.changeLog],
    },
    retainsSerialization,
  };
}

function parseInitialValue(
  collector: DefinitionDiagnosticCollector,
  stored: string,
  path: DefinitionPath,
  options: { readonly emptyIsObject: boolean },
): JsonValue | undefined {
  if (stored.trim() === "" && options.emptyIsObject) return {};
  try {
    const parsed = JSON.parse(stored) as JsonValue;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      // A scope's initial value is the object its state root describes. A
      // string here means the value was encoded twice, which the shipped
      // `document-drive` gen module does; the compiler cannot produce it, so
      // the adapter cannot claim the two approaches are equivalent.
      collector.add({
        code: "PH-DM-INITIAL-VALUE-INVALID",
        path,
        message:
          "The stored initial value does not parse to an object, so it cannot be the value this state root holds.",
        expected: "a JSON object",
        received: stored,
        repair:
          "Store the scope's initial value as JSON once; a doubly encoded string parses to a string.",
      });
      return undefined;
    }
    return parsed;
  } catch (error) {
    collector.add({
      code: "PH-DM-INITIAL-VALUE-INVALID",
      path,
      message: `The stored initial value is not JSON: ${error instanceof Error ? error.message : String(error)}`,
      expected: "a stored JSON string",
      received: stored,
      repair: "Store the scope's initial value as JSON.",
    });
    return undefined;
  }
}

/**
 * True when canonical printing does not reproduce a stored string byte for
 * byte — the state segments, every operation segment, and both initial
 * values. Segment membership comes from `assignStoredSegments`, the one rule
 * the compiler prints with, so this cannot drift from what the compiler
 * would actually emit.
 */
function printedDiffers(
  specification: DocumentSpecification,
  operations: readonly NormalizedOperation[],
  types: readonly NamedGraphQLTypeDefinition[],
  names: { readonly global: string; readonly local: string },
  initialValues: { readonly global: JsonValue; readonly local: JsonValue },
): boolean {
  const hasLocalRoot = types.some((type) => type.name === names.local);
  const segments = assignStoredSegments({
    types,
    globalRoot: names.global,
    localRoot: hasLocalRoot ? names.local : null,
    operations: operations.map((operation) => ({
      key: operation.key,
      input: operation.definition.input,
    })),
  });
  const inventory = namedTypeInventory(types);
  const print = (definitions: readonly NamedGraphQLTypeDefinition[]) =>
    printSchemaSegment(definitions, inventory);
  if (print(segments.global) !== specification.state.global.schema) {
    return true;
  }
  if (print(segments.local) !== specification.state.local.schema) {
    return true;
  }
  if (
    JSON.stringify(initialValues.global) !==
    specification.state.global.initialValue
  ) {
    return true;
  }
  // An empty local scope is stored either way round: code generation already
  // reads an empty string as `{}`.
  const canonicalLocal = hasLocalRoot
    ? JSON.stringify(initialValues.local)
    : "{}";
  const storedLocal = specification.state.local.initialValue;
  if (
    canonicalLocal !== storedLocal &&
    !(!hasLocalRoot && storedLocal.trim() === "")
  ) {
    return true;
  }
  return operations.some((operation) => {
    if (operation.storedSchema === null) return false;
    const printed = segments.operations.get(operation.key);
    if (printed === undefined) return true;
    return print(printed) !== operation.storedSchema;
  });
}

/**
 * Normalizes one generated module, or one stored `DocumentModelPHState`, into
 * the shared structured shape.
 */
export function adaptSchemaFirstDocumentModelModule(
  value: unknown,
  source: DefinitionSource,
  options: SchemaFirstAdapterOptions = {},
): NormalizedDocumentModelResult {
  const probe = new DefinitionDiagnosticCollector();
  const stored = storedModel(probe, value, options);
  if (stored === undefined) {
    return {
      artifacts: [],
      upgradeManifest: null,
      diagnostics: probe.diagnostics,
    };
  }
  const collector = new DefinitionDiagnosticCollector({
    kind: "document-model",
    key: stored.global.id,
    version: stored.version,
  });
  const { global, version } = stored;
  const names = deriveDocumentModelNames({ id: global.id, name: global.name });

  // The specification array is copied in its existing order: not sorted, not
  // filtered to the greatest version, and never rejected for carrying history
  // the current loading accepts.
  const normalized = global.specifications.map((specification, index) =>
    normalizeSpecification(
      collector,
      specification,
      {
        model: global.name,
        global: names.globalStateRootName,
        local: names.localStateRootName,
      },
      ["specifications", index],
    ),
  );
  if (normalized.some((entry) => entry === undefined)) {
    return {
      artifacts: [],
      upgradeManifest: null,
      diagnostics: collector.diagnostics,
    };
  }
  const specifications = normalized as readonly NormalizedSpecification[];

  const definition: DocumentModelDefinition = {
    kind: "powerhouse.document-model",
    formatVersion: 1,
    compatibility: {
      // Stored IDs are preserved, never re-derived, so identity is explicit.
      identity: "explicit-schema-first",
      scalarCoercion: "document-engineering-1.40",
      serialization: specifications.some((entry) => entry.retainsSerialization)
        ? "explicit-schema-first"
        : "canonical-v1",
    },
    model: {
      documentType: global.id,
      graphQLName: names.graphQLName,
      name: global.name,
      description: global.description,
      extension: global.extension,
      author: {
        name: global.author.name,
        website: global.author.website,
      },
    },
    specifications: specifications.map((entry) => entry.specification),
  };

  if (!checkDocumentModelDefinitionShape(collector, definition, [])) {
    return {
      artifacts: [],
      upgradeManifest: null,
      diagnostics: collector.diagnostics,
    };
  }
  const specification = definition.specifications.find(
    (entry) => entry.version === version,
  );
  if (specification === undefined) {
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
    return {
      artifacts: [],
      upgradeManifest: null,
      diagnostics: collector.diagnostics,
    };
  }

  const artifact: NormalizedDocumentModelArtifact = {
    kind: "powerhouse.document-model-artifact",
    source,
    documentType: global.id,
    version,
    definition,
    digest: canonicalDigest(definition),
    documentModel: stored.documentModel,
    identity: identityVectorsOf(specification, global.id),
  };
  return {
    artifacts: [artifact],
    upgradeManifest: null,
    diagnostics: collector.diagnostics,
  };
}
