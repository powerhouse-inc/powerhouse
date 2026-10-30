import type {
  Action,
  Actions,
  DocumentModelDefinition,
  DocumentModelGlobalState,
  DocumentModelUtils,
  DocumentSpecification,
  MaterializedStateDefinition,
  PHBaseState,
  PHDocument,
  Reducer,
  State,
  StateReducer,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import {
  baseActions,
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
  baseCreateDocument,
  baseLoadFromInputVersioned,
  baseSaveToFileHandle,
  createAction,
  createBaseState,
  createReducer,
  createState,
  defaultBaseState,
  isDocumentAction,
  normalizeDocumentModelVersion,
} from "@powerhousedao/shared/document-model";
import { z } from "zod";
import type {
  CompiledDocumentModelVersion,
  CompiledErrorClass,
  CompiledModule,
  CompiledOperation,
  OperationErrorClass,
} from "../compiler/compile.js";
import { describeReceived } from "../kernel/diagnostics.js";
import { compiledVersionOf } from "../model/define-document-model.js";
import { modelDiagnostics } from "../model/diagnostic-codes.js";
import { copyUpgradeManifest, familyDeclarationOf } from "../model/family.js";
import type {
  DocumentModelFamilyDefinition,
  DocumentModelVersionDefinition,
} from "../model/types.js";
import type {
  CodeFirstDocumentModelModule,
  DocumentModelFamily,
} from "./types.js";

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createOperationErrorClass({
  className,
  code,
}: CompiledErrorClass): OperationErrorClass {
  const named = {
    [className]: class extends Error {
      errorCode = code;

      constructor(message: string = className) {
        super(message);
      }
    },
  };
  return named[className];
}

function operationErrorClasses(
  module: CompiledModule,
): ReadonlyMap<
  CompiledOperation,
  Readonly<Record<string, OperationErrorClass>>
> {
  const classes = new Map<string, OperationErrorClass>();
  return new Map(
    module.operations.map((operation) => [
      operation,
      Object.freeze(
        Object.fromEntries(
          operation.errorClasses.map((errorClass) => {
            const ErrorClass =
              classes.get(errorClass.className) ??
              createOperationErrorClass(errorClass);
            classes.set(errorClass.className, ErrorClass);
            return [errorClass.key, ErrorClass];
          }),
        ),
      ),
    ]),
  );
}

function createActionCreator(operation: CompiledOperation) {
  const validator = () => operation.inputValidator;
  const create = (input: Record<string, unknown>): Action =>
    createAction(
      operation.actionType,
      { ...input },
      undefined,
      validator,
      operation.scope,
    );
  return operation.input.fields.length === 0
    ? (input: Record<string, unknown> = {}) => create(input)
    : create;
}

type RuntimeBehavior = {
  readonly reducer: Reducer<PHBaseState>;
  readonly actions: Actions;
};

function createRuntimeBehavior(
  version: CompiledDocumentModelVersion,
): RuntimeBehavior {
  type Dispatch = {
    readonly operation: CompiledOperation;
    readonly errors: Readonly<Record<string, OperationErrorClass>>;
  };
  const dispatchTable = new Map<string, Dispatch>();
  const modelActions: Record<string, (...args: never[]) => Action> = {};
  for (const module of version.modules) {
    const errors = operationErrorClasses(module);
    for (const operation of module.operations) {
      dispatchTable.set(operation.actionType, {
        operation,
        errors: errors.get(operation) ?? {},
      });
      modelActions[operation.creatorKey] = createActionCreator(operation);
    }
  }

  const stateReducer: StateReducer<PHBaseState> = (state, action, dispatch) => {
    if (isDocumentAction(action)) return state;
    const entry = dispatchTable.get(action.type);
    if (entry === undefined) return state;
    const { operation } = entry;
    const parsed: unknown = operation.inputValidator.parse(action.input);
    const reduced = operation.parsesInput
      ? { ...action, input: parsed }
      : action;
    const reduce = operation.declaration.reduce as (
      state: unknown,
      input: unknown,
      context: unknown,
    ) => void;
    reduce(
      (state as unknown as Record<string, unknown>)[operation.scope],
      reduced.input,
      { errors: entry.errors, action: reduced, dispatch },
    );
    return undefined;
  };

  return {
    reducer: createReducer(stateReducer),
    actions: { ...baseActions, ...modelActions } as unknown as Actions,
  };
}

function storedState(state: {
  readonly materialized: MaterializedStateDefinition;
}): State {
  return {
    schema: state.materialized.schema,
    initialValue: state.materialized.initialValue,
    examples: state.materialized.examples.map(({ id, value }) => ({
      id,
      value,
    })),
  };
}

function storedSpecification(
  version: CompiledDocumentModelVersion,
): DocumentSpecification {
  const { specification } = version;
  return {
    version: specification.version,
    state: {
      global: storedState(specification.state.global),
      local: storedState(specification.state.local),
    },
    modules: version.modules.map(({ definition, operations }) => ({
      id: definition.id,
      name: definition.name,
      description: definition.description,
      operations: operations.map((operation) => ({
        id: operation.definition.id,
        name: operation.definition.name,
        description: operation.definition.description,
        schema: operation.inputSchema,
        template: operation.definition.template,
        reducer: operation.definition.reducer,
        errors: operation.definition.errors.map((error) => ({
          id: error.id,
          code: error.code,
          name: error.name,
          description: error.description,
          template: error.template,
        })),
        examples: operation.definition.examples.map(({ id, value }) => ({
          id,
          value,
        })),
        scope: operation.definition.scope,
      })),
    })),
    changeLog: [...specification.changeLog],
  };
}

function storedGlobalState(
  version: CompiledDocumentModelVersion,
  versions: readonly CompiledDocumentModelVersion[],
): DocumentModelGlobalState {
  const { model } = version.definition;
  return {
    id: model.documentType,
    name: model.name,
    author: { ...model.author },
    extension: model.extension,
    description: model.description,
    specifications: versions.map(storedSpecification),
  };
}

function stampedVersion(state: unknown): number {
  const documentScope =
    typeof state === "object" && state !== null
      ? (state as { document?: unknown }).document
      : undefined;
  const version =
    typeof documentScope === "object" && documentScope !== null
      ? (documentScope as { version?: unknown }).version
      : undefined;
  return normalizeDocumentModelVersion(
    typeof version === "number" ? version : undefined,
  );
}

function createRuntimeSchemas(
  version: CompiledDocumentModelVersion,
  known: readonly CompiledDocumentModelVersion[],
) {
  const header = BaseDocumentHeaderSchema.extend({
    documentType: z.literal(version.config.id),
  });
  const states = new Map<number, z.ZodType>();
  const documents = new Map<number, z.ZodType>();
  for (const candidate of known) {
    const state = BaseDocumentStateSchema.extend({
      global: candidate.config.specifications.global.root.validator,
    });
    states.set(candidate.config.version, state);
    documents.set(
      candidate.config.version,
      z.object({ header, state, initialState: state }),
    );
  }
  const ownState = states.get(version.config.version) as z.ZodType;
  const ownDocument = documents.get(version.config.version) as z.ZodType;
  return {
    state: (state: unknown) => states.get(stampedVersion(state)) ?? ownState,
    document: (document: unknown) =>
      documents.get(
        stampedVersion(
          typeof document === "object" && document !== null
            ? (document as { state?: unknown }).state
            : undefined,
        ),
      ) ?? ownDocument,
  };
}

function materializeVersion(
  version: CompiledDocumentModelVersion,
  versions: readonly CompiledDocumentModelVersion[],
  behaviors: ReadonlyMap<CompiledDocumentModelVersion, RuntimeBehavior>,
  upgradeManifest: UpgradeManifest<readonly number[]>,
): CodeFirstDocumentModelModule {
  const known = versions.filter(
    (candidate) => candidate.config.version <= version.config.version,
  );
  const schemas = createRuntimeSchemas(version, known);
  const behavior = behaviors.get(version) as RuntimeBehavior;
  const initialGlobalState = version.initialGlobalState as Record<
    string,
    unknown
  >;
  const initialLocalState = version.initialLocalState as Record<
    string,
    unknown
  >;
  const reducers = Object.fromEntries(
    known.map((candidate) => [
      candidate.config.version,
      (behaviors.get(candidate) as RuntimeBehavior).reducer,
    ]),
  );

  const utils: DocumentModelUtils<PHBaseState> = {
    fileExtension: version.config.extension,
    createState(state) {
      const scoped = state as
        | {
            readonly auth?: PHBaseState["auth"];
            readonly document?: Partial<PHBaseState["document"]>;
            readonly global?: Record<string, unknown>;
            readonly local?: Record<string, unknown>;
          }
        | undefined;
      return {
        ...createBaseState(scoped?.auth, {
          version: version.config.version,
          ...scoped?.document,
        }),
        global: { ...cloneJson(initialGlobalState), ...scoped?.global },
        local: { ...cloneJson(initialLocalState), ...scoped?.local },
      } as PHBaseState;
    },
    createDocument(state) {
      return baseCreateDocument(utils.createState, state, version.config.id);
    },
    saveToFileHandle(document, input) {
      return baseSaveToFileHandle(document, input);
    },
    loadFromInput(input) {
      return baseLoadFromInputVersioned(input, { reducers, upgradeManifest });
    },
    isStateOfType(state): state is PHBaseState {
      return schemas.state(state).safeParse(state).success;
    },
    assertIsStateOfType(state): asserts state is PHBaseState {
      schemas.state(state).parse(state);
    },
    isDocumentOfType(document): document is PHDocument<PHBaseState> {
      return schemas.document(document).safeParse(document).success;
    },
    assertIsDocumentOfType(
      document,
    ): asserts document is PHDocument<PHBaseState> {
      schemas.document(document).parse(document);
    },
  };

  const definition: DocumentModelDefinition = cloneJson({
    ...version.definition,
    specifications: versions.map((candidate) => candidate.specification),
  });
  return {
    version: version.config.version,
    reducer: behavior.reducer,
    actions: behavior.actions,
    utils,
    documentModel: createState(
      defaultBaseState(),
      cloneJson(storedGlobalState(version, versions)),
    ),
    definition,
  };
}

function materializeFamily(
  versions: readonly CompiledDocumentModelVersion[],
  upgradeManifest: UpgradeManifest<readonly number[]>,
): DocumentModelFamily {
  const behaviors = new Map(
    versions.map((version) => [version, createRuntimeBehavior(version)]),
  );
  const modules = versions.map((version) =>
    materializeVersion(version, versions, behaviors, upgradeManifest),
  );
  return {
    modules: modules as DocumentModelFamily["modules"],
    upgradeManifest,
    at(number) {
      const module = modules.find((candidate) => candidate.version === number);
      if (module === undefined) {
        throw new RangeError(
          `Document model ${upgradeManifest.documentType} has no version ${String(number)}; it publishes ${versions.map((version) => version.config.version).join(", ")}.`,
        );
      }
      return module as never;
    },
  };
}

function refuseDefinition(value: unknown): never {
  return modelDiagnostics.fail({
    code: "PH-DM-DECLARATION-INVALID",
    path: [],
    message:
      "materialize takes a definition returned by context.version or defineDocumentModelFamily.",
    expected: "a version or family definition",
    received: describeReceived(value),
    repair:
      "Pass the value context.version({ modules }) or defineDocumentModelFamily(...) returned.",
  });
}

/**
 * @experimental Builds the `DocumentModelModule` a host serves from a
 * compiled version, or one module per version from a family. A single
 * version is materialized as a one-version family.
 */
export function materialize<
  TState extends PHBaseState,
  TActions extends Actions,
>(
  definition: DocumentModelVersionDefinition<number, TState, TActions>,
): CodeFirstDocumentModelModule<TState, TActions>;
export function materialize<
  const TVersions extends readonly DocumentModelVersionDefinition[],
>(
  definition: DocumentModelFamilyDefinition<TVersions>,
): DocumentModelFamily<TVersions>;
export function materialize(
  definition: DocumentModelVersionDefinition | DocumentModelFamilyDefinition,
): CodeFirstDocumentModelModule | DocumentModelFamily {
  const version = compiledVersionOf(definition);
  if (version !== undefined) {
    const { id, version: number } = version.config;
    return materializeFamily([version], {
      documentType: id,
      latestVersion: number,
      supportedVersions: [number],
      upgrades: {},
    }).modules[0];
  }
  const family = familyDeclarationOf(definition);
  if (family === undefined) return refuseDefinition(definition);
  return materializeFamily(
    family.versions,
    copyUpgradeManifest(family.upgradeManifest),
  );
}
