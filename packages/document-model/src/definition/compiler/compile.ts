import type {
  Action,
  CompiledErrorDefinition,
  DefinitionExample,
  DefinitionPath,
  DocumentModelDefinition,
  DocumentModelModuleDefinition,
  DocumentModelOperationDefinition,
  DocumentModelSpecificationDefinition,
  InputTypeDefinition,
  JsonValue,
  NamedGraphQLTypeDefinition,
  NonEmptyStateDefinition,
  SignalDispatch,
  StateDefinition,
} from "@powerhousedao/shared/document-model";
import type { z } from "zod";
import type {
  AnyTypeDescriptor,
  InputDescriptor,
  ObjectDescriptor,
} from "../dsl/types.js";
import { DefinitionDiagnosticCollector } from "../kernel/diagnostic-collector.js";
import { printSchemaSegment } from "../kernel/printer.js";
import { isAuthoredSchemaName } from "../kernel/primitives.js";
import { nameAnonymousInput } from "./anonymous-input.js";
import { DescriptorWalk } from "./descriptor-walk.js";
import {
  type CompilerDiagnosticCode,
  compilerDiagnostics,
} from "./diagnostic-codes.js";
import {
  type DefinitionIdentityRequest,
  deriveDefinitionId,
} from "./identity.js";
import { serializeAndValidateInitialValue } from "./initial-value.js";
import {
  checkDerivedNameCollisions,
  type DerivedModuleNames,
  type DerivedOperationNames,
  deriveDocumentModelErrorNames,
  deriveDocumentModelModuleNames,
  deriveDocumentModelOperationNames,
  deriveOperationErrorClassName,
  type DocumentModelNames,
  PLATFORM_ACTION_TYPES,
} from "./naming.js";
import { assignStoredSegments } from "./segments.js";
import {
  declareProjectScalars,
  inputReachesProjectScalar,
  scalarReferences,
} from "./stored-scalar.js";

export type StateRootDescriptor = ObjectDescriptor;

export type OperationErrorClass = new (message?: string) => Error & {
  readonly errorCode: string;
};

export type OperationErrorDeclaration = {
  readonly code?: string | null;
  readonly name?: string | null;
  readonly description?: string | null;
  readonly template?: string | null;
};

export type DefinitionExampleDeclaration = {
  readonly key: string;
  readonly value: string;
};

type OperationReducerContext = {
  readonly errors: Readonly<Record<string, OperationErrorClass>>;
  readonly action: Action;
  readonly dispatch: SignalDispatch | undefined;
};

export type OperationReducer = (
  state: never,
  input: never,
  context: OperationReducerContext,
) => void;

export type OperationDeclaration = {
  readonly key: string;
  readonly scope: "global" | "local";
  readonly input: InputDescriptor;
  readonly description: string | null;
  readonly errors: Readonly<Record<string, OperationErrorDeclaration>>;
  readonly examples: readonly DefinitionExampleDeclaration[];
  readonly template: string | null;
  readonly reducerTemplate: string | null;
  readonly reduce: OperationReducer;
};

export type ModuleDeclaration = {
  readonly key: string;
  readonly description: string | null;
  readonly operations: readonly OperationDeclaration[];
};

export type ScopeDeclaration = {
  readonly root: StateRootDescriptor | null;
  readonly initialValue: unknown;
  readonly examples: readonly DefinitionExampleDeclaration[];
};

export type DocumentModelCompilationConfig = {
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
  readonly names: DocumentModelNames;
  readonly scopes: {
    readonly auxiliaryTypes: readonly AnyTypeDescriptor[];
    readonly global: ScopeDeclaration & { readonly root: StateRootDescriptor };
    readonly local: ScopeDeclaration;
  };
};

export type CompiledOperation = {
  readonly declaration: OperationDeclaration;
  readonly actionType: string;
  readonly creatorKey: string;
  readonly scope: "global" | "local";
  readonly input: InputTypeDefinition;
  readonly inputSchema: string;
  readonly inputValidator: z.ZodType;
  readonly parsesInput: boolean;
  readonly errorClasses: readonly CompiledErrorClass[];
  readonly definition: DocumentModelOperationDefinition;
};

export type CompiledErrorClass = {
  readonly key: string;
  readonly className: string;
  readonly code: string;
};

export type CompiledModule = {
  readonly operations: readonly CompiledOperation[];
  readonly definition: DocumentModelModuleDefinition;
};

type DraftModule = Omit<CompiledModule, "operations"> & {
  readonly operations: readonly Omit<
    CompiledOperation,
    "inputSchema" | "parsesInput"
  >[];
};

export type CompiledDocumentModelVersion = {
  readonly config: DocumentModelCompilationConfig;
  readonly specification: DocumentModelSpecificationDefinition;
  readonly definition: DocumentModelDefinition;
  readonly initialGlobalState: JsonValue;
  readonly initialLocalState: JsonValue;
  readonly modules: readonly CompiledModule[];
};

type Collector = DefinitionDiagnosticCollector<CompilerDiagnosticCode>;

type MaterializedInitialValue = {
  readonly value: JsonValue;
  readonly serialized: string;
};

function deriveId(
  collector: Collector,
  request: DefinitionIdentityRequest,
  path: DefinitionPath,
): string | undefined {
  const derived = deriveDefinitionId(request, path);
  if (derived.ok) return derived.id;
  collector.merge([derived.diagnostic]);
  return undefined;
}

function exampleDefinitions(
  collector: Collector,
  examples: readonly DefinitionExampleDeclaration[],
  path: DefinitionPath,
  identity: (key: string, path: DefinitionPath) => string | undefined,
): DefinitionExample[] {
  const keys = new Map<string, number>();
  const definitions: DefinitionExample[] = [];
  examples.forEach((example, index) => {
    const keyPath = [...path, index, "key"];
    const first = keys.get(example.key);
    if (first !== undefined) {
      collector.add({
        code: "PH-DM-IDENTITY-INVALID",
        path: keyPath,
        message: `Example key ${JSON.stringify(example.key)} is declared twice, so both examples would derive one ID.`,
        expected: "a unique stable key for every example in this declaration",
        received: example.key,
        repair: "Give each example its own stable key.",
        related: [
          {
            path: [...path, first, "key"],
            message: "The first example with this key was declared here.",
          },
        ],
      });
      return;
    }
    keys.set(example.key, index);
    const id = identity(example.key, keyPath);
    if (id === undefined) return;
    definitions.push({ id, key: example.key, value: example.value });
  });
  return definitions;
}

function errorDefinitions(
  collector: Collector,
  documentType: string,
  moduleKey: string,
  operation: OperationDeclaration,
  path: DefinitionPath,
): CompiledErrorDefinition[] {
  return Object.entries(operation.errors).flatMap(([key, declaration]) => {
    const id = deriveId(
      collector,
      {
        kind: "error",
        documentType,
        moduleKey,
        operationKey: operation.key,
        errorKey: key,
      },
      [...path, "errors", key],
    );
    if (id === undefined) return [];
    const names = deriveDocumentModelErrorNames(key, declaration);
    return [
      {
        id,
        key,
        code: names.storedCode,
        name: names.storedName,
        description: declaration.description ?? null,
        template: declaration.template ?? null,
      },
    ];
  });
}

function errorClasses(
  collector: Collector,
  errors: readonly CompiledErrorDefinition[],
  path: DefinitionPath,
  moduleClasses: Map<
    string,
    { readonly code: string; readonly path: DefinitionPath }
  >,
): CompiledErrorClass[] {
  return errors.flatMap((error) => {
    const errorPath = [...path, "errors", error.key];
    const name = error.name ?? "";
    const className = deriveOperationErrorClassName(name);
    if (!isAuthoredSchemaName(className)) {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: [...errorPath, "name"],
        message: `Error name ${JSON.stringify(name)} derives the class name ${JSON.stringify(className)}, so codegen could not generate its class.`,
        expected: "a name whose PascalCase spelling is a GraphQL name",
        received: name,
        repair:
          "Give the error a name such as LimitReached, or remove name so the key names the class.",
      });
      return [];
    }
    const codePath = [...errorPath, "code"];
    if (error.code !== null && error.code !== error.code.trim()) {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: codePath,
        message: `Error code ${JSON.stringify(error.code)} has whitespace around it.`,
        expected: "a code without leading or trailing whitespace",
        received: error.code,
        repair:
          "Remove the whitespace around the code, or leave the code empty so the class name is the code.",
      });
      return [];
    }
    const code = error.code || className;
    const first = moduleClasses.get(className);
    if (first === undefined) {
      moduleClasses.set(className, { code, path: codePath });
    } else if (first.code !== code) {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: codePath,
        message: `The error class ${className} has the code ${JSON.stringify(first.code)} elsewhere in this module, and a module has one ${className} class.`,
        expected: first.code,
        received: code,
        repair: `Give both ${className} errors the same code, or give one another name.`,
        related: [
          { path: first.path, message: "The first code was declared here." },
        ],
      });
      return [];
    }
    return [{ key: error.key, className, code }];
  });
}

function nonEmptyState(
  name: string,
  initialValue: MaterializedInitialValue,
  examples: readonly DefinitionExample[],
  schema: string,
): NonEmptyStateDefinition {
  return {
    root: { kind: "named", name, required: true },
    initialValue: initialValue.value,
    examples,
    unknownKeys: "preserve",
    materialized: {
      schema,
      initialValue: initialValue.serialized,
      examples: examples.map(({ id, value }) => ({ id, value })),
    },
  };
}

function materializeInitialValue(
  collector: Collector,
  root: StateRootDescriptor,
  scope: "global" | "local",
  value: unknown,
): MaterializedInitialValue | undefined {
  const materialized = serializeAndValidateInitialValue(root, value);
  if (materialized.ok) return materialized;
  const notSerializable = materialized.reason === "not-serializable";
  collector.add({
    code: "PH-DM-INITIAL-VALUE-INVALID",
    path: ["scopes", scope, "initialValue"],
    message: notSerializable
      ? "This initial value cannot produce a stored JSON string."
      : `The ${root.name} schema rejects this initial value.`,
    expected: `a value ${root.name} accepts and JSON.stringify can serialize`,
    received: materialized.message,
    repair: notSerializable
      ? "Replace the value with JSON data; a stored initial value must serialize."
      : "Correct the initial value so the declared state schema accepts it.",
  });
  return undefined;
}

export function compileDocumentModelVersion(
  config: DocumentModelCompilationConfig,
  modules: readonly ModuleDeclaration[],
): CompiledDocumentModelVersion {
  const collector: Collector = new DefinitionDiagnosticCollector(
    compilerDiagnostics,
    { kind: "document-model", key: config.id, version: config.version },
  );
  const walk = new DescriptorWalk(collector);
  const documentType = config.names.documentType;
  const identities = new Map<string, DefinitionPath>();
  const claimIdentity = (id: string, path: DefinitionPath): void => {
    const first = identities.get(id);
    if (first === undefined) {
      identities.set(id, path);
      return;
    }
    collector.add({
      code: "PH-DM-IDENTITY-INVALID",
      path,
      message: `Specification ID ${id} is already claimed by another declaration.`,
      expected: "one ID per module, operation, error, and example",
      received: id,
      repair: "Give the two declarations distinct keys.",
      related: [{ path: first, message: "First claimed here." }],
    });
  };

  const { global, local, auxiliaryTypes } = config.scopes;
  walk.visitType(global.root, "output", ["scopes", "global", "schema"]);
  if (local.root !== null) {
    walk.visitType(local.root, "output", ["scopes", "local", "schema"]);
  }
  auxiliaryTypes.forEach((descriptor, index) =>
    walk.visitType(descriptor, "output", ["scopes", "auxiliaryTypes", index]),
  );

  const moduleKeys = new Map<string, number>();
  const derivedNames: DerivedModuleNames[] = [];
  const draftModules: DraftModule[] = [];

  modules.forEach((module, moduleIndex) => {
    const modulePath: DefinitionPath = ["modules", moduleIndex];
    const firstModule = moduleKeys.get(module.key);
    if (firstModule !== undefined) {
      collector.add({
        code: "PH-DM-DUPLICATE-NAME",
        path: [...modulePath, "key"],
        message: `Module key ${JSON.stringify(module.key)} is declared twice.`,
        expected: "a unique key for every module in a version",
        received: module.key,
        repair: "Rename one of the two modules.",
        related: [
          {
            path: ["modules", firstModule, "key"],
            message: "The first module with this key was declared here.",
          },
        ],
      });
      return;
    }
    moduleKeys.set(module.key, moduleIndex);

    const moduleNames = deriveDocumentModelModuleNames(config.name, module.key);
    const moduleId = deriveId(
      collector,
      { kind: "module", documentType, moduleKey: module.key },
      [...modulePath, "key"],
    );
    if (moduleId !== undefined) claimIdentity(moduleId, [...modulePath, "id"]);

    const operations: DraftModule["operations"][number][] = [];
    const derivedOperations: DerivedOperationNames[] = [];
    const moduleErrorClasses = new Map<
      string,
      { readonly code: string; readonly path: DefinitionPath }
    >();
    module.operations.forEach((operation, operationIndex) => {
      const operationPath: DefinitionPath = [
        ...modulePath,
        "operations",
        operationIndex,
      ];
      const names = deriveDocumentModelOperationNames(operation.key);
      derivedOperations.push({ key: operation.key, names });
      if (names.creatorKey !== operation.key) {
        collector.add({
          code: "PH-DM-DECLARATION-INVALID",
          path: [...operationPath, "key"],
          message: `Operation key ${JSON.stringify(operation.key)} derives creator key ${JSON.stringify(names.creatorKey)}, so the typed and the runtime action creator keys would differ.`,
          expected: names.creatorKey,
          received: operation.key,
          repair: `Rename the operation to ${JSON.stringify(names.creatorKey)}.`,
        });
      }
      if (PLATFORM_ACTION_TYPES.has(names.actionType)) {
        collector.add({
          code: "PH-DM-DUPLICATE-ACTION",
          path: [...operationPath, "key"],
          message: `Operation key ${JSON.stringify(operation.key)} derives action type ${names.actionType}, which the document runtime reduces itself, so this operation's reducer would never run.`,
          expected: "an action type the document runtime does not own",
          received: names.actionType,
          repair: "Rename the operation.",
        });
      }
      const operationId = deriveId(
        collector,
        {
          kind: "operation",
          documentType,
          moduleKey: module.key,
          operationKey: operation.key,
        },
        [...operationPath, "key"],
      );
      if (operationId !== undefined) {
        claimIdentity(operationId, [...operationPath, "id"]);
      }

      const inputPath = [...operationPath, "input"];
      if (
        operation.input.name !== null &&
        operation.input.name !== names.inputTypeName
      ) {
        collector.add({
          code: "PH-DM-DECLARATION-INVALID",
          path: inputPath,
          message: `Operation ${JSON.stringify(operation.key)} declares the input type ${JSON.stringify(operation.input.name)}, but the stored format binds an operation's input type name to the operation.`,
          expected: names.inputTypeName,
          received: operation.input.name,
          repair: `Declare the input inline as ph.input({ fields: { ... } }), referencing a shared named input from a field when several operations need the same fields, or name it ${JSON.stringify(names.inputTypeName)}.`,
        });
        return;
      }
      const namedInput = collector.capture(() =>
        nameAnonymousInput(operation.input, names.inputTypeName),
      );
      if (namedInput === undefined) return;
      const input = walk.visitType(namedInput, "input", inputPath, {
        emit: operation.input.name !== null,
      });
      if (input === undefined || input.kind !== "input") return;

      const errors = errorDefinitions(
        collector,
        documentType,
        module.key,
        operation,
        operationPath,
      );
      errors.forEach((error) =>
        claimIdentity(error.id, [...operationPath, "errors", error.key, "id"]),
      );
      const examples = exampleDefinitions(
        collector,
        operation.examples,
        [...operationPath, "examples"],
        (key, path) =>
          deriveId(
            collector,
            {
              kind: "operation-example",
              documentType,
              moduleKey: module.key,
              operationKey: operation.key,
              exampleKey: key,
            },
            path,
          ),
      );
      examples.forEach((example) =>
        claimIdentity(example.id, [
          ...operationPath,
          "examples",
          example.key,
          "id",
        ]),
      );

      if (operationId === undefined) return;
      operations.push({
        declaration: operation,
        actionType: names.actionType,
        creatorKey: names.creatorKey,
        scope: operation.scope,
        input,
        inputValidator: namedInput.validator,
        errorClasses: errorClasses(
          collector,
          errors,
          operationPath,
          moduleErrorClasses,
        ),
        definition: {
          id: operationId,
          key: operation.key,
          name: names.storedName,
          description: operation.description,
          actionType: names.actionType,
          creatorKey: names.creatorKey,
          scope: operation.scope,
          input,
          errors,
          examples,
          template: operation.template,
          reducer: operation.reducerTemplate,
        },
      });
    });

    derivedNames.push({
      key: module.key,
      names: moduleNames,
      operations: derivedOperations,
    });
    if (moduleId === undefined) return;
    draftModules.push({
      operations,
      definition: {
        id: moduleId,
        key: module.key,
        name: moduleNames.storedName,
        description: module.description,
        operations: operations.map((operation) => operation.definition),
      },
    });
  });

  collector.merge(checkDerivedNameCollisions(derivedNames));

  const stateExamples = (scope: "global" | "local") => {
    const examples = exampleDefinitions(
      collector,
      config.scopes[scope].examples,
      ["scopes", scope, "examples"],
      (key, path) =>
        deriveId(
          collector,
          { kind: "state-example", documentType, scope, exampleKey: key },
          path,
        ),
    );
    examples.forEach((example) =>
      claimIdentity(example.id, [
        "scopes",
        scope,
        "examples",
        example.key,
        "id",
      ]),
    );
    return examples;
  };
  const globalExamples = stateExamples("global");
  const localExamples = stateExamples("local");

  walk.checkInterfaceImplementations();
  walk.checkInputCycles();
  collector.throwIfFailed();

  const types: readonly NamedGraphQLTypeDefinition[] = walk.definitions;
  const printSegment = (definitions: readonly NamedGraphQLTypeDefinition[]) =>
    printSchemaSegment(definitions, types);
  const globalName = config.names.globalStateRootName;
  const localName =
    local.root === null ? null : config.names.localStateRootName;
  const segments = assignStoredSegments({
    types,
    globalRoot: globalName,
    localRoot: localName,
    operations: draftModules.flatMap((module) =>
      module.operations.map((operation) => ({
        key: `${module.definition.key}/${operation.definition.key}`,
        input: operation.input,
      })),
    ),
  });

  const globalInitialValue = materializeInitialValue(
    collector,
    global.root,
    "global",
    global.initialValue,
  );
  const localInitialValue =
    local.root === null
      ? { value: {}, serialized: "{}" }
      : materializeInitialValue(
          collector,
          local.root,
          "local",
          local.initialValue,
        );
  collector.throwIfFailed();
  if (globalInitialValue === undefined || localInitialValue === undefined) {
    throw new TypeError("A state initial value could not be materialized.");
  }

  const localState: StateDefinition =
    localName === null
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
      : nonEmptyState(
          localName,
          localInitialValue,
          localExamples,
          printSegment(segments.local),
        );

  const compiledModules = draftModules.map((module): CompiledModule => ({
    ...module,
    operations: module.operations.map((operation) => {
      const key = `${module.definition.key}/${operation.definition.key}`;
      return {
        ...operation,
        inputSchema: printSegment(
          segments.operations.get(key) ?? [operation.input],
        ),
        parsesInput: inputReachesProjectScalar(
          operation.input,
          types,
          walk.packageScalars,
        ),
      };
    }),
  }));

  const specification: DocumentModelSpecificationDefinition = {
    version: config.version,
    scalars: scalarReferences(walk.catalogScalars, walk.packageScalars),
    graphQLCompatibility: null,
    types,
    state: {
      global: nonEmptyState(
        globalName,
        globalInitialValue,
        globalExamples,
        declareProjectScalars(
          printSegment(segments.global),
          walk.packageScalars,
        ),
      ),
      local: localState,
    },
    modules: compiledModules.map((module) => module.definition),
    changeLog: [...config.changeLog],
  };

  return {
    config,
    specification,
    definition: {
      kind: "powerhouse.document-model",
      formatVersion: 1,
      compatibility: {
        identity: "derived-v1",
        scalarCoercion: "catalog-v1",
        serialization: "canonical-v1",
      },
      model: {
        documentType,
        graphQLName: config.names.graphQLName,
        name: config.name,
        description: config.description,
        extension: config.extension,
        author: { name: config.author.name, website: config.author.website },
      },
      specifications: [specification],
    },
    initialGlobalState: globalInitialValue.value,
    initialLocalState: localInitialValue.value,
    modules: compiledModules,
  };
}
