import type {
  DocumentModelDefinitionV1,
  DocumentModelOperationDefinitionV1,
  DocumentModelSpecificationDefinitionV1,
  DocumentSpecification,
  JsonValue,
  LegacyGraphQLDocumentCompatibilityV1,
  NamedGraphQLTypeDefinitionV1,
  SignalDispatch,
} from "@powerhousedao/shared/document-model";
import { DefinitionDiagnosticError, failDefinition } from "./diagnostics.js";
import { isTypeDescriptor } from "./descriptor-registry.js";
import { nameAnonymousInput } from "./field.js";
import type {
  AnyTypeDescriptor,
  InputDescriptor,
  StateRootDescriptor,
} from "./types.js";
import {
  collectNamedDefinitions,
  printDescriptorSchema,
  printNamedDefinition,
} from "./printer.js";
import {
  deriveDocumentModelModuleNames,
  deriveDocumentModelNames,
  deriveDocumentModelOperationNames,
} from "./naming.js";
import {
  assertIdentitySegment,
  canonicalJson,
  cloneJson,
  deriveDefinitionId,
  sha256,
} from "./primitives.js";
import { serializeAndValidateInitialValue } from "./zod.js";
import {
  DOCUMENT_SCALAR_REFERENCE_ORDER,
  scalarNamesInReference,
} from "./scalar-references.js";

export type DefinitionExampleDeclaration = {
  readonly key: string;
  readonly value: string;
};

export type OperationErrorDeclaration = {
  readonly code?: string | null;
  readonly name?: string | null;
  readonly description?: string | null;
  readonly template?: string | null;
};

export type LegacySpecificationCompatibility = {
  readonly kind: "explicit-legacy";
  readonly definition: DocumentModelSpecificationDefinitionV1;
  readonly materialized: DocumentSpecification;
};

export type RuntimeReducerError = Error & { readonly errorCode: string };
export type RuntimeReducerErrorClass = new (
  message?: string,
) => RuntimeReducerError;

export type RuntimeOperationContext = {
  readonly errors: Readonly<Record<string, RuntimeReducerErrorClass>>;
  readonly action: {
    readonly id: string;
    readonly type: string;
    readonly timestampUtcMs: string;
    readonly input: unknown;
    readonly scope: string;
    readonly context?: unknown;
  };
  readonly dispatch: SignalDispatch | undefined;
};

export type RuntimeOperationDeclaration = {
  readonly key: string;
  readonly scope: "global" | "local";
  readonly input: InputDescriptor;
  readonly description: string | null;
  readonly errors: Readonly<Record<string, OperationErrorDeclaration>>;
  readonly examples: readonly DefinitionExampleDeclaration[];
  readonly template: string | null;
  readonly reducerTemplate: string | null;
  readonly reduce: (
    state: any,
    input: any,
    context: RuntimeOperationContext,
  ) => void;
};

export type RuntimeModuleDeclaration = {
  readonly contextId: symbol;
  readonly key: string;
  readonly description: string | null;
  readonly operations: readonly RuntimeOperationDeclaration[];
};

export type DocumentModelCompilationConfig = {
  readonly contextId: symbol;
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly extension: string;
  readonly version: number;
  readonly author: {
    readonly name: string;
    readonly website: string | null;
  };
  readonly changeLog: readonly string[];
  readonly specifications: {
    readonly auxiliaryTypes: readonly AnyTypeDescriptor[];
    readonly graphQLCompatibility: LegacyGraphQLDocumentCompatibilityV1 | null;
    readonly global: {
      readonly schema: StateRootDescriptor;
      readonly initialValue: unknown;
      readonly examples: readonly DefinitionExampleDeclaration[];
    };
    readonly local:
      | {
          readonly schema: StateRootDescriptor;
          readonly initialValue: unknown;
          readonly examples: readonly DefinitionExampleDeclaration[];
        }
      | {
          readonly schema: null;
          readonly initialValue: unknown;
          readonly examples: readonly DefinitionExampleDeclaration[];
        };
  };
};

export type CompiledRuntimeOperation = RuntimeOperationDeclaration & {
  readonly id: string;
  readonly actionType: string;
  readonly creatorKey: string;
  readonly inputDefinition: NonNullable<
    DocumentModelOperationDefinitionV1["input"]
  >;
  readonly errorClasses: Readonly<Record<string, RuntimeReducerErrorClass>>;
};

export type CompiledRuntimeModule = Omit<
  RuntimeModuleDeclaration,
  "operations"
> & {
  readonly id: string;
  readonly storedName: string;
  readonly operations: readonly CompiledRuntimeOperation[];
};

export type CompiledDocumentModelVersion = {
  readonly config: DocumentModelCompilationConfig;
  readonly graphQLName: string;
  readonly definition: DocumentModelDefinitionV1;
  readonly definitionDigest: `sha256:${string}`;
  readonly specification: DocumentModelSpecificationDefinitionV1;
  readonly initialGlobalState: JsonValue;
  readonly initialLocalState: JsonValue;
  readonly modules: readonly CompiledRuntimeModule[];
  readonly legacyMaterializedSpecification: DocumentSpecification | null;
};

function validateExamples(
  examples: readonly DefinitionExampleDeclaration[],
  path: readonly (string | number)[],
): void {
  const keys = new Set<string>();
  examples.forEach((example, index) => {
    const candidate: unknown = example;
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      typeof example.key !== "string" ||
      typeof example.value !== "string"
    ) {
      failDefinition({
        code: "PH-DM-EXAMPLE-INVALID",
        path: [...path, index],
        message: "An example must contain string key and value properties.",
        repair: "Use { key: string, value: string } for every example.",
      });
    }
    assertIdentity(example.key, [...path, index, "key"]);
    if (keys.has(example.key)) {
      failDefinition({
        code: "PH-DM-IDENTITY-INVALID",
        path: [...path, index, "key"],
        message: `Example key ${JSON.stringify(example.key)} is duplicated.`,
        repair: "Give every example in this declaration a unique stable key.",
      });
    }
    keys.add(example.key);
  });
}

function assertIdentity(
  value: string,
  path: readonly (string | number)[],
): void {
  try {
    assertIdentitySegment(value, path.join("."));
  } catch (error) {
    failDefinition({
      code: "PH-DM-IDENTITY-INVALID",
      path,
      message: error instanceof Error ? error.message : String(error),
      repair:
        "Use a string identity segment already normalized to Unicode NFC.",
    });
  }
}

function definitionId(
  documentType: string,
  kind: Parameters<typeof deriveDefinitionId>[1],
  segments: readonly string[],
  path: readonly (string | number)[],
): string {
  try {
    return deriveDefinitionId(documentType, kind, ...segments);
  } catch (error) {
    return failDefinition({
      code: "PH-DM-IDENTITY-INVALID",
      path,
      message: error instanceof Error ? error.message : String(error),
      repair:
        "Use unique string identity keys already normalized to Unicode NFC.",
    });
  }
}

function assertStateRoot(
  descriptor: unknown,
  expectedName: string,
  path: readonly (string | number)[],
): asserts descriptor is StateRootDescriptor {
  if (
    !isTypeDescriptor(descriptor) ||
    (descriptor as { readonly kind?: unknown }).kind !== "object" ||
    (descriptor as { readonly name?: unknown }).name !== expectedName
  ) {
    failDefinition({
      code: "PH-DM-STATE-ROOT-INVALID",
      path,
      message: `State schema must be a ph.object named ${expectedName}.`,
      expected: expectedName,
      received:
        descriptor !== null && typeof descriptor === "object"
          ? String((descriptor as { readonly name?: unknown }).name)
          : String(descriptor),
      repair: `Declare this scope with ph.object(${JSON.stringify(expectedName)}, { fields: { ... } }).`,
    });
  }
}

function exactEmptyLocalState(value: unknown): value is Record<string, never> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).length === 0
  );
}

function createErrorClass(key: string): RuntimeReducerErrorClass {
  return class extends Error implements RuntimeReducerError {
    readonly errorCode = key;

    constructor(message = key) {
      super(message);
    }
  };
}

function contextualInput(
  input: InputDescriptor,
  name: string,
): InputDescriptor {
  return nameAnonymousInput(input, name);
}

function scalarNamesInDefinition(
  definition: NamedGraphQLTypeDefinitionV1,
  names: Set<string>,
): void {
  if (definition.kind === "enum" || definition.kind === "union") return;
  for (const field of definition.fields) {
    if ("args" in field) {
      field.args?.forEach((argument) =>
        scalarNamesInReference(argument.type, names),
      );
    }
    scalarNamesInReference(field.type, names);
  }
}

function validateOperationErrors(
  errors: Readonly<Record<string, OperationErrorDeclaration>>,
  path: readonly (string | number)[],
): void {
  for (const [key, error] of Object.entries(errors)) {
    const candidate: unknown = error;
    assertIdentity(key, [...path, key]);
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      failDefinition({
        code: "PH-DM-ERROR-INVALID",
        path: [...path, key],
        message: "An operation error declaration must be an object.",
        repair:
          "Use an object with optional code, name, description, and template strings.",
      });
    }
    for (const [property, value] of Object.entries(error)) {
      if (!["code", "name", "description", "template"].includes(property)) {
        failDefinition({
          code: "PH-DM-ERROR-INVALID",
          path: [...path, key, property],
          message: `Operation error property ${JSON.stringify(property)} is unsupported.`,
          repair:
            "Remove it or use code, name, description, or template instead.",
        });
      }
      if (value !== null && typeof value !== "string") {
        failDefinition({
          code: "PH-DM-ERROR-INVALID",
          path: [...path, key, property],
          message:
            "Operation error metadata must be a string or null when present.",
          repair: "Use a string, null, or omit the property.",
        });
      }
    }
  }
}

function compatibilityFailure(
  path: readonly (string | number)[],
  message: string,
  expected?: string,
  received?: string,
): never {
  return failDefinition({
    code: "PH-DM-COMPATIBILITY-INVALID",
    path: ["compatibility", ...path],
    message,
    ...(expected === undefined ? {} : { expected }),
    ...(received === undefined ? {} : { received }),
    repair:
      "Regenerate the compatibility data from the matching legacy specification and keep the authored descriptors in sync.",
  });
}

function sameJson(left: JsonValue, right: JsonValue): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function assertSameValue(
  left: JsonValue,
  right: JsonValue,
  path: readonly (string | number)[],
  label: string,
): void {
  if (!sameJson(left, right)) {
    compatibilityFailure(
      path,
      `${label} differs from the authored declaration.`,
      canonicalJson(left),
      canonicalJson(right),
    );
  }
}

function assertSameStringArray(
  left: readonly string[],
  right: readonly string[],
  path: readonly (string | number)[],
  label: string,
): void {
  assertSameValue([...left] as JsonValue, [...right] as JsonValue, path, label);
}

function inputShape(
  input: NonNullable<DocumentModelOperationDefinitionV1["input"]>,
): JsonValue {
  return {
    name: input.name,
    fields: input.fields.map((field) => ({
      key: field.key,
      name: field.name,
      type: field.type,
      ...(Object.hasOwn(field, "defaultValue")
        ? { defaultValue: field.defaultValue as JsonValue }
        : {}),
    })),
  };
}

function assertExampleDeclarations(
  authored: readonly DefinitionExampleDeclaration[],
  compatible: readonly { readonly key: string; readonly value: string }[],
  path: readonly (string | number)[],
): void {
  assertSameValue(
    authored as unknown as JsonValue,
    compatible.map(({ key, value }) => ({ key, value })) as JsonValue,
    path,
    "Compatibility examples",
  );
}

function assertOpaqueId(
  value: unknown,
  path: readonly (string | number)[],
  ids: Map<string, readonly (string | number)[]>,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.normalize("NFC") !== value
  ) {
    compatibilityFailure(
      path,
      "A compatibility ID must be a nonempty NFC string.",
    );
  }
  // Explicit legacy mode preserves the bytes already accepted by current
  // hosts. Some installed specifications reuse opaque IDs; the migration
  // verifier reports that anomaly, but core V1 cannot rewrite it and still
  // claim stored-state parity.
  if (!ids.has(value)) ids.set(value, path);
}

function errorMetadata(
  key: string,
  error: OperationErrorDeclaration,
): JsonValue {
  return {
    key,
    code: Object.hasOwn(error, "code") ? (error.code ?? null) : key,
    name: Object.hasOwn(error, "name") ? (error.name ?? null) : key,
    description: error.description ?? null,
    template: error.template ?? null,
  };
}

function assertMaterializedCompatibility(
  definition: DocumentModelSpecificationDefinitionV1,
  materialized: DocumentSpecification,
): void {
  if (materialized.version !== definition.version) {
    compatibilityFailure(
      ["materialized", "version"],
      "The stored and structured compatibility versions differ.",
      String(definition.version),
      String(materialized.version),
    );
  }
  assertSameValue(
    materialized.state as unknown as JsonValue,
    {
      global: definition.state.global.materialized,
      local: definition.state.local.materialized,
    },
    ["materialized", "state"],
    "Stored state serialization",
  );
  assertSameStringArray(
    materialized.changeLog,
    definition.changeLog,
    ["materialized", "changeLog"],
    "Stored change log",
  );
  if (materialized.modules.length !== definition.modules.length) {
    compatibilityFailure(
      ["materialized", "modules"],
      "Stored and structured compatibility module counts differ.",
      String(definition.modules.length),
      String(materialized.modules.length),
    );
  }
  definition.modules.forEach((module, moduleIndex) => {
    const storedModule = materialized.modules.at(moduleIndex);
    if (!storedModule) return;
    assertSameValue(
      {
        id: storedModule.id,
        name: storedModule.name,
        description: storedModule.description,
      },
      {
        id: module.id,
        name: module.name,
        description: module.description,
      },
      ["materialized", "modules", moduleIndex],
      "Stored module metadata",
    );
    if (storedModule.operations.length !== module.operations.length) {
      compatibilityFailure(
        ["materialized", "modules", moduleIndex, "operations"],
        "Stored and structured compatibility operation counts differ.",
        String(module.operations.length),
        String(storedModule.operations.length),
      );
    }
    module.operations.forEach((operation, operationIndex) => {
      const storedOperation = storedModule.operations.at(operationIndex);
      if (!storedOperation) return;
      assertSameValue(
        {
          id: storedOperation.id,
          name: storedOperation.name,
          description: storedOperation.description,
          template: storedOperation.template,
          reducer: storedOperation.reducer,
          errors: storedOperation.errors,
          examples: storedOperation.examples,
          scope: storedOperation.scope,
          hasSchema: storedOperation.schema !== null,
        },
        {
          id: operation.id,
          name: operation.name,
          description: operation.description,
          template: operation.template,
          reducer: operation.reducer,
          errors: operation.errors.map(
            ({ id, code, name, description, template }) => ({
              id,
              code,
              name,
              description,
              template,
            }),
          ),
          examples: operation.examples.map(({ id, value }) => ({ id, value })),
          scope: operation.scope,
          hasSchema: operation.input !== null,
        },
        ["materialized", "modules", moduleIndex, "operations", operationIndex],
        "Stored operation metadata",
      );
    });
  });
}

function applyLegacyCompatibility(
  plan: CompiledDocumentModelVersion,
  compatibility: LegacySpecificationCompatibility,
): CompiledDocumentModelVersion {
  if (
    (compatibility as unknown as { readonly kind?: unknown }).kind !==
    "explicit-legacy"
  ) {
    compatibilityFailure(
      ["kind"],
      "The compatibility discriminator is unsupported.",
      "explicit-legacy",
      String((compatibility as { readonly kind?: unknown }).kind),
    );
  }
  const specification = cloneJson(compatibility.definition);
  const materialized = cloneJson(compatibility.materialized);
  if (specification.version !== plan.config.version) {
    compatibilityFailure(
      ["definition", "version"],
      "The compatibility version differs from the authored model version.",
      String(plan.config.version),
      String(specification.version),
    );
  }
  if (specification.state.global.root.name !== plan.graphQLName + "State") {
    compatibilityFailure(
      ["definition", "state", "global", "root", "name"],
      "The compatibility global root differs from the authored model root.",
      plan.graphQLName + "State",
      specification.state.global.root.name,
    );
  }
  const expectedLocalName = plan.graphQLName + "LocalState";
  const compatibleLocalName = specification.state.local.root?.name ?? null;
  const authoredLocalName =
    plan.config.specifications.local.schema === null ? null : expectedLocalName;
  if (compatibleLocalName !== authoredLocalName) {
    compatibilityFailure(
      ["definition", "state", "local", "root"],
      "The compatibility local root differs from the authored model root.",
      String(authoredLocalName),
      String(compatibleLocalName),
    );
  }
  assertSameValue(
    plan.initialGlobalState,
    specification.state.global.initialValue,
    ["definition", "state", "global", "initialValue"],
    "Compatibility global initial state",
  );
  assertSameValue(
    plan.initialLocalState,
    specification.state.local.initialValue,
    ["definition", "state", "local", "initialValue"],
    "Compatibility local initial state",
  );
  assertSameStringArray(
    plan.config.changeLog,
    specification.changeLog,
    ["definition", "changeLog"],
    "Compatibility change log",
  );
  assertExampleDeclarations(
    plan.config.specifications.global.examples,
    specification.state.global.examples,
    ["definition", "state", "global", "examples"],
  );
  assertExampleDeclarations(
    plan.config.specifications.local.examples,
    specification.state.local.examples,
    ["definition", "state", "local", "examples"],
  );
  if (specification.modules.length !== plan.modules.length) {
    compatibilityFailure(
      ["definition", "modules"],
      "The compatibility module count differs from the authored declaration.",
      String(plan.modules.length),
      String(specification.modules.length),
    );
  }

  const ids = new Map<string, readonly (string | number)[]>();
  specification.state.global.examples.forEach((example, index) =>
    assertOpaqueId(
      example.id,
      ["definition", "state", "global", "examples", index, "id"],
      ids,
    ),
  );
  specification.state.local.examples.forEach((example, index) =>
    assertOpaqueId(
      example.id,
      ["definition", "state", "local", "examples", index, "id"],
      ids,
    ),
  );
  const actionTypes = new Map<string, readonly (string | number)[]>();
  const compatibleModules = plan.modules.map((module, moduleIndex) => {
    const compatibleModule = specification.modules.at(moduleIndex);
    if (!compatibleModule) return module;
    if (compatibleModule.description !== module.description) {
      compatibilityFailure(
        ["definition", "modules", moduleIndex],
        "Compatibility module description differs from the authored declaration.",
      );
    }
    assertOpaqueId(
      compatibleModule.id,
      ["definition", "modules", moduleIndex, "id"],
      ids,
    );
    if (compatibleModule.operations.length !== module.operations.length) {
      compatibilityFailure(
        ["definition", "modules", moduleIndex, "operations"],
        "The compatibility operation count differs from the authored declaration.",
        String(module.operations.length),
        String(compatibleModule.operations.length),
      );
    }
    const operations = module.operations.map((operation, operationIndex) => {
      const compatibleOperation =
        compatibleModule.operations.at(operationIndex);
      if (!compatibleOperation) return operation;
      if (
        compatibleOperation.description !== operation.description ||
        compatibleOperation.scope !== operation.scope ||
        compatibleOperation.template !== operation.template ||
        compatibleOperation.reducer !== operation.reducerTemplate
      ) {
        compatibilityFailure(
          ["definition", "modules", moduleIndex, "operations", operationIndex],
          "Compatibility operation metadata differs from the authored declaration.",
        );
      }
      if (compatibleOperation.input === null) {
        compatibilityFailure(
          [
            "definition",
            "modules",
            moduleIndex,
            "operations",
            operationIndex,
            "input",
          ],
          "Core V1 operation declarations require a compatibility input.",
        );
      }
      assertSameValue(
        inputShape(operation.inputDefinition),
        inputShape(compatibleOperation.input),
        [
          "definition",
          "modules",
          moduleIndex,
          "operations",
          operationIndex,
          "input",
        ],
        "Compatibility operation input shape",
      );
      assertExampleDeclarations(
        operation.examples,
        compatibleOperation.examples,
        [
          "definition",
          "modules",
          moduleIndex,
          "operations",
          operationIndex,
          "examples",
        ],
      );
      const authoredErrors = Object.entries(operation.errors).map(
        ([key, error]) => errorMetadata(key, error),
      );
      const compatibleErrors = compatibleOperation.errors.map(
        ({ key, code, name, description, template }) => ({
          key,
          code,
          name,
          description,
          template,
        }),
      );
      assertSameValue(
        authoredErrors,
        compatibleErrors,
        [
          "definition",
          "modules",
          moduleIndex,
          "operations",
          operationIndex,
          "errors",
        ],
        "Compatibility operation errors",
      );
      assertOpaqueId(
        compatibleOperation.id,
        [
          "definition",
          "modules",
          moduleIndex,
          "operations",
          operationIndex,
          "id",
        ],
        ids,
      );
      compatibleOperation.errors.forEach((error, errorIndex) =>
        assertOpaqueId(
          error.id,
          [
            "definition",
            "modules",
            moduleIndex,
            "operations",
            operationIndex,
            "errors",
            errorIndex,
            "id",
          ],
          ids,
        ),
      );
      compatibleOperation.examples.forEach((example, exampleIndex) =>
        assertOpaqueId(
          example.id,
          [
            "definition",
            "modules",
            moduleIndex,
            "operations",
            operationIndex,
            "examples",
            exampleIndex,
            "id",
          ],
          ids,
        ),
      );
      const previousAction = actionTypes.get(compatibleOperation.actionType);
      if (previousAction) {
        compatibilityFailure(
          [
            "definition",
            "modules",
            moduleIndex,
            "operations",
            operationIndex,
            "actionType",
          ],
          `Compatibility action type ${compatibleOperation.actionType} is duplicated.`,
          `unique; first used at ${previousAction.join("/")}`,
          compatibleOperation.actionType,
        );
      }
      actionTypes.set(compatibleOperation.actionType, [
        "definition",
        "modules",
        moduleIndex,
        "operations",
        operationIndex,
      ]);
      return {
        ...operation,
        id: compatibleOperation.id,
        actionType: compatibleOperation.actionType,
        creatorKey: compatibleOperation.creatorKey,
      };
    });
    return {
      ...module,
      id: compatibleModule.id,
      storedName: compatibleModule.name,
      operations,
    };
  });

  assertMaterializedCompatibility(specification, materialized);
  const definition: DocumentModelDefinitionV1 = {
    ...plan.definition,
    compatibility: {
      identity: "explicit-legacy",
      scalarCoercion: "document-engineering-1.40",
      serialization: "explicit-legacy",
    },
    specifications: [specification],
  };
  return {
    ...plan,
    definition,
    definitionDigest: sha256(canonicalJson(definition as unknown as JsonValue)),
    specification,
    modules: compatibleModules,
    legacyMaterializedSpecification: materialized,
  };
}

export function compileDocumentModelVersion(
  config: DocumentModelCompilationConfig,
  modules: readonly RuntimeModuleDeclaration[],
  compatibility?: LegacySpecificationCompatibility,
): CompiledDocumentModelVersion {
  const modelNames = deriveDocumentModelNames(config.name);
  assertIdentity(config.id, ["id"]);
  assertStateRoot(
    config.specifications.global.schema,
    modelNames.globalStateName,
    ["specifications", "global", "schema"],
  );
  const globalSchema = config.specifications.global.schema;

  const localDeclaration = config.specifications.local;
  if (localDeclaration.schema !== null) {
    assertStateRoot(localDeclaration.schema, modelNames.localStateName, [
      "specifications",
      "local",
      "schema",
    ]);
  } else if (!exactEmptyLocalState(localDeclaration.initialValue)) {
    failDefinition({
      code: "PH-DM-STATE-ROOT-INVALID",
      path: ["specifications", "local", "initialValue"],
      message:
        "A null local schema requires an exact empty plain JSON object initial value.",
      repair: "Use local: { schema: null, initialValue: {}, examples: [] }.",
    });
  }

  validateExamples(config.specifications.global.examples, [
    "specifications",
    "global",
    "examples",
  ]);
  validateExamples(localDeclaration.examples, [
    "specifications",
    "local",
    "examples",
  ]);

  const globalInitial = serializeAndValidateInitialValue(
    globalSchema,
    config.specifications.global.initialValue,
    ["specifications", "global", "initialValue"],
  );
  const localInitial =
    localDeclaration.schema === null
      ? ({ value: {}, serialized: "{}" } as const)
      : serializeAndValidateInitialValue(
          localDeclaration.schema,
          localDeclaration.initialValue,
          ["specifications", "local", "initialValue"],
        );

  const moduleKeys = new Set<string>();
  const actionTypes = new Map<string, readonly (string | number)[]>();
  const compiledModules: CompiledRuntimeModule[] = [];
  const contextualInputs: InputDescriptor[] = [];
  const anonymousInputNames = new Set<string>();

  modules.forEach((module, moduleIndex) => {
    if (module.contextId !== config.contextId) {
      failDefinition({
        code: "PH-DM-MODULE-CONTEXT-MISMATCH",
        path: ["modules", moduleIndex],
        message: "A module belongs to a different document-model context.",
        repair: "Finalize only modules created by this context.module call.",
      });
    }
    assertIdentity(module.key, ["modules", moduleIndex, "key"]);
    if (moduleKeys.has(module.key)) {
      failDefinition({
        code: "PH-DM-IDENTITY-INVALID",
        path: ["modules", moduleIndex, "key"],
        message: `Module key ${JSON.stringify(module.key)} is duplicated.`,
        repair: "Give every module in a version a unique stable key.",
      });
    }
    moduleKeys.add(module.key);
    const moduleNames = deriveDocumentModelModuleNames(
      modelNames.valueName,
      module.key,
    );
    const errorClasses = new Map<string, RuntimeReducerErrorClass>();
    const operations = module.operations.map((operation, operationIndex) => {
      assertIdentity(operation.key, [
        "modules",
        moduleIndex,
        "operations",
        operationIndex,
        "key",
      ]);
      const operationNames = deriveDocumentModelOperationNames(operation.key, {
        hasInput: true,
      });
      const duplicatePath = actionTypes.get(operationNames.actionType);
      if (duplicatePath) {
        failDefinition({
          code: "PH-DM-DUPLICATE-ACTION",
          path: ["modules", moduleIndex, "operations", operationIndex, "key"],
          message: `More than one operation derives action type ${operationNames.actionType}.`,
          repair:
            "Rename one operation so every derived persisted action type is unique.",
        });
      }
      actionTypes.set(operationNames.actionType, [
        "modules",
        moduleIndex,
        "operations",
        operationIndex,
      ]);
      validateExamples(operation.examples, [
        "modules",
        moduleIndex,
        "operations",
        operationIndex,
        "examples",
      ]);
      validateOperationErrors(operation.errors, [
        "modules",
        moduleIndex,
        "operations",
        operationIndex,
        "errors",
      ]);

      const inputName =
        operation.input.name ?? operationNames.actionInputTypeName;
      if (!inputName) {
        return failDefinition({
          code: "PH-DM-OPERATION-INPUT-INVALID",
          path: ["modules", moduleIndex, "operations", operationIndex, "input"],
          message: "A code-first operation must declare an input descriptor.",
          repair: "Use ph.input({ fields: {} }) for an empty input.",
        });
      }
      const resolvedInput = contextualInput(operation.input, inputName);
      contextualInputs.push(resolvedInput);
      if (operation.input.name === null) anonymousInputNames.add(inputName);
      const inputDefinition = collectNamedDefinitions([resolvedInput], {
        inputUnknownKeys: "preserve",
      })[0];
      if (inputDefinition.kind !== "input") {
        return failDefinition({
          code: "PH-DM-OPERATION-INPUT-INVALID",
          path: ["modules", moduleIndex, "operations", operationIndex, "input"],
          message: "An operation input must be a ph.input descriptor.",
          repair: "Declare the input with ph.input({ fields: { ... } }).",
        });
      }

      const operationErrorClasses: Record<string, RuntimeReducerErrorClass> =
        {};
      for (const key of Object.keys(operation.errors)) {
        let ErrorClass = errorClasses.get(key);
        if (!ErrorClass) {
          ErrorClass = createErrorClass(key);
          errorClasses.set(key, ErrorClass);
        }
        operationErrorClasses[key] = ErrorClass;
      }

      return {
        ...operation,
        id: definitionId(
          config.id,
          "operation",
          [module.key, operation.key],
          ["modules", moduleIndex, "operations", operationIndex, "id"],
        ),
        actionType: operationNames.actionType,
        creatorKey: operationNames.actionCreatorKey,
        inputDefinition,
        errorClasses: operationErrorClasses,
      };
    });

    compiledModules.push({
      ...module,
      id: definitionId(
        config.id,
        "module",
        [module.key],
        ["modules", moduleIndex, "id"],
      ),
      storedName: moduleNames.storedName,
      operations,
    });
  });

  const descriptorRoots = [
    globalSchema,
    ...(localDeclaration.schema === null ? [] : [localDeclaration.schema]),
    ...config.specifications.auxiliaryTypes,
    ...contextualInputs,
  ];
  const discoveredTypes = collectNamedDefinitions(descriptorRoots, {
    inputUnknownKeys: "preserve",
  });
  const types = discoveredTypes.filter(
    (definition) =>
      !(
        definition.kind === "input" && anonymousInputNames.has(definition.name)
      ),
  );

  const scalarNames = new Set<string>();
  discoveredTypes.forEach((definition) =>
    scalarNamesInDefinition(definition, scalarNames),
  );
  const scalars = DOCUMENT_SCALAR_REFERENCE_ORDER.filter((name) =>
    scalarNames.has(name),
  ).map((name) => ({
    name,
    implementation: `powerhouse.catalog#${name}` as const,
    coercionProfile: "document-engineering-1.40" as const,
  }));

  const globalExamples = config.specifications.global.examples.map(
    (example) => ({
      ...example,
      id: definitionId(
        config.id,
        "state-example",
        ["global", example.key],
        ["specifications", "global", "examples", example.key],
      ),
    }),
  );
  const localExamples = localDeclaration.examples.map((example) => ({
    ...example,
    id: definitionId(
      config.id,
      "state-example",
      ["local", example.key],
      ["specifications", "local", "examples", example.key],
    ),
  }));

  const modulesDefinition = compiledModules.map((module) => ({
    id: module.id,
    key: module.key,
    name: module.storedName,
    description: module.description,
    operations: module.operations.map((operation) => ({
      id: operation.id,
      key: operation.key,
      name: deriveDocumentModelOperationNames(operation.key, {
        hasInput: true,
      }).storedName,
      description: operation.description,
      actionType: operation.actionType,
      creatorKey: operation.creatorKey,
      scope: operation.scope,
      input: operation.inputDefinition,
      errors: Object.entries(operation.errors).map(([key, error]) => ({
        id: definitionId(
          config.id,
          "error",
          [module.key, operation.key, key],
          ["modules", module.key, "operations", operation.key, "errors", key],
        ),
        key,
        code: Object.hasOwn(error, "code") ? (error.code ?? null) : key,
        name: Object.hasOwn(error, "name") ? (error.name ?? null) : key,
        description: error.description ?? null,
        template: error.template ?? null,
      })),
      examples: operation.examples.map((example) => ({
        ...example,
        id: definitionId(
          config.id,
          "operation-example",
          [module.key, operation.key, example.key],
          [
            "modules",
            module.key,
            "operations",
            operation.key,
            "examples",
            example.key,
          ],
        ),
      })),
      template: operation.template,
      reducer: operation.reducerTemplate,
    })),
  }));

  const globalSchemaText = printDescriptorSchema([globalSchema]);
  const localSchemaText =
    localDeclaration.schema === null
      ? ""
      : printDescriptorSchema([localDeclaration.schema]);

  const specification: DocumentModelSpecificationDefinitionV1 = {
    version: config.version,
    scalars,
    graphQLCompatibility: config.specifications.graphQLCompatibility,
    types,
    state: {
      global: {
        root: {
          kind: "named",
          name: modelNames.globalStateName,
          required: true,
        },
        initialValue: globalInitial.value,
        examples: globalExamples,
        unknownKeys: "preserve",
        materialized: {
          schema: globalSchemaText,
          initialValue: globalInitial.serialized,
          examples: globalExamples.map(({ id, value }) => ({ id, value })),
        },
      },
      local:
        localDeclaration.schema === null
          ? {
              root: null,
              initialValue: {},
              examples: localExamples,
              unknownKeys: "preserve",
              materialized: {
                schema: "",
                initialValue: "{}",
                examples: localExamples.map(({ id, value }) => ({ id, value })),
              },
            }
          : {
              root: {
                kind: "named",
                name: modelNames.localStateName,
                required: true,
              },
              initialValue: localInitial.value,
              examples: localExamples,
              unknownKeys: "preserve",
              materialized: {
                schema: localSchemaText,
                initialValue: localInitial.serialized,
                examples: localExamples.map(({ id, value }) => ({ id, value })),
              },
            },
    },
    modules: modulesDefinition,
    changeLog: [...config.changeLog],
  };

  const definition: DocumentModelDefinitionV1 = {
    kind: "powerhouse.document-model",
    formatVersion: 1,
    compatibility: {
      identity: "derived-v1",
      scalarCoercion: "document-engineering-1.40",
      serialization: "canonical-v1",
    },
    model: {
      documentType: config.id,
      graphQLName: modelNames.graphQLName,
      name: config.name,
      description: config.description,
      extension: config.extension,
      author: { ...config.author },
    },
    specifications: [specification],
  };

  const plan: CompiledDocumentModelVersion = {
    config,
    graphQLName: modelNames.graphQLName,
    definition,
    definitionDigest: sha256(canonicalJson(definition as unknown as JsonValue)),
    specification,
    initialGlobalState: globalInitial.value,
    initialLocalState: localInitial.value,
    modules: compiledModules,
    legacyMaterializedSpecification: null,
  };
  return compatibility ? applyLegacyCompatibility(plan, compatibility) : plan;
}

export function operationSchema(operation: CompiledRuntimeOperation): string {
  return printNamedDefinition(operation.inputDefinition);
}

export function isDefinitionDiagnosticError(
  error: unknown,
): error is DefinitionDiagnosticError {
  return error instanceof DefinitionDiagnosticError;
}
