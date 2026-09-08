import {
  baseActions,
  baseCreateDocument,
  baseLoadFromInputVersioned,
  baseSaveToFileHandle,
  createAction,
  createBaseState,
  createReducer,
  createState as createDocumentModelState,
  defaultBaseState,
  isDocumentAction,
  type Actions,
  type DocumentModelDefinitionV1,
  type DocumentModelGlobalState,
  type DocumentModelModule,
  type DocumentModelPHState,
  type DocumentSpecification,
  type DocumentModelUtils,
  type PHBaseState,
  type PHDocument,
  type Reducer,
  type StateReducer,
  type UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import type { JsonValue } from "@powerhousedao/shared/document-model";
import type {
  CompiledDocumentModelVersion,
  CompiledRuntimeOperation,
} from "./structured.js";
import { printNamedDefinition } from "./printer.js";
import { cloneJson } from "./primitives.js";
import { createDocumentRuntimeSchemas } from "./zod.js";

export type CodeFirstRuntimeBehavior<
  TState extends PHBaseState = PHBaseState,
  TActions extends Actions = Actions,
> = {
  readonly reducer: Reducer<TState>;
  readonly actions: TActions;
};

export type MaterializedCodeFirstModule<
  TState extends PHBaseState = PHBaseState,
  TActions extends Actions = Actions,
> = Omit<DocumentModelModule<TState>, "actions" | "definition" | "version"> & {
  version: number;
  actions: TActions;
  definition: DocumentModelDefinitionV1;
};

function createActionCreator(operation: CompiledRuntimeOperation) {
  return (input: unknown) =>
    createAction(
      operation.actionType,
      { ...(input as Record<string, unknown>) },
      undefined,
      () => operation.input.validator,
      operation.scope,
    );
}

export function createCodeFirstRuntimeBehavior<
  TState extends PHBaseState = PHBaseState,
  TActions extends Actions = Actions,
>(
  plan: CompiledDocumentModelVersion,
): CodeFirstRuntimeBehavior<TState, TActions> {
  const operations = new Map<string, CompiledRuntimeOperation>();
  const modelActions: Actions = {};
  for (const module of plan.modules) {
    for (const operation of module.operations) {
      operations.set(operation.actionType, operation);
      modelActions[operation.creatorKey] = createActionCreator(operation);
    }
  }

  const stateReducer: StateReducer<TState> = (state, action, dispatch) => {
    if (isDocumentAction(action)) return state as unknown as TState;
    const operation = operations.get(action.type);
    if (!operation) return state as unknown as TState;

    // Both generated validation points ignore Zod's parsed copy. The authored
    // reducer receives the raw persisted input and persisted action scope.
    operation.input.validator.parse(action.input);
    operation.reduce(
      (state as Record<string, unknown>)[action.scope],
      action.input,
      {
        errors: operation.errorClasses,
        action,
        dispatch,
      },
    );
    return undefined;
  };

  return {
    reducer: createReducer(stateReducer),
    actions: { ...baseActions, ...modelActions } as unknown as TActions,
  };
}

function materializeGlobalState(
  plan: CompiledDocumentModelVersion,
  plans: readonly CompiledDocumentModelVersion[],
): DocumentModelGlobalState {
  return {
    id: plan.definition.model.documentType,
    name: plan.definition.model.name,
    author: { ...plan.definition.model.author },
    extension: plan.definition.model.extension,
    description: plan.definition.model.description,
    specifications: cloneJson(
      plans.map((candidate) =>
        candidate.legacyMaterializedSpecification
          ? candidate.legacyMaterializedSpecification
          : ({
              version: candidate.specification.version,
              state: {
                global: {
                  schema:
                    candidate.specification.state.global.materialized.schema,
                  initialValue:
                    candidate.specification.state.global.materialized
                      .initialValue,
                  examples:
                    candidate.specification.state.global.materialized.examples.map(
                      ({ id, value }) => ({ id, value }),
                    ),
                },
                local: {
                  schema:
                    candidate.specification.state.local.materialized.schema,
                  initialValue:
                    candidate.specification.state.local.materialized
                      .initialValue,
                  examples:
                    candidate.specification.state.local.materialized.examples.map(
                      ({ id, value }) => ({ id, value }),
                    ),
                },
              },
              modules: candidate.specification.modules.map((module) => ({
                id: module.id,
                name: module.name,
                description: module.description,
                operations: module.operations.map((operation) => ({
                  id: operation.id,
                  name: operation.name,
                  description: operation.description,
                  schema:
                    operation.input === null
                      ? null
                      : printNamedDefinition(operation.input),
                  template: operation.template,
                  reducer: operation.reducer,
                  errors: operation.errors.map((error) => ({
                    id: error.id,
                    code: error.code,
                    name: error.name,
                    description: error.description,
                    template: error.template,
                  })),
                  examples: operation.examples.map(({ id, value }) => ({
                    id,
                    value,
                  })),
                  scope: operation.scope,
                })),
              })),
              changeLog: [...candidate.specification.changeLog],
            } satisfies DocumentSpecification),
      ),
    ) as DocumentModelGlobalState["specifications"],
  };
}

function initialObject(value: JsonValue): Record<string, unknown> {
  return value as Record<string, unknown>;
}

export function materializeCodeFirstModule<
  TState extends PHBaseState = PHBaseState,
  TActions extends Actions = Actions,
>(options: {
  readonly plan: CompiledDocumentModelVersion;
  readonly behavior: CodeFirstRuntimeBehavior<TState, TActions>;
  readonly plans: readonly CompiledDocumentModelVersion[];
  readonly reducers: Readonly<Record<number, Reducer<PHBaseState>>>;
  readonly upgradeManifest: UpgradeManifest<readonly number[]>;
}): MaterializedCodeFirstModule<TState, TActions> {
  const { plan, behavior } = options;
  const definition: DocumentModelDefinitionV1 = cloneJson({
    ...plan.definition,
    specifications: options.plans.map((candidate) => candidate.specification),
  });
  const documentModel: DocumentModelPHState = createDocumentModelState(
    defaultBaseState(),
    materializeGlobalState(plan, options.plans),
  );
  const initialGlobalState = initialObject(plan.initialGlobalState);
  const initialLocalState = initialObject(plan.initialLocalState);
  const schemas = createDocumentRuntimeSchemas<TState>({
    documentType: plan.config.id,
    global: plan.config.specifications.global.schema,
  });
  const assertState: (state: unknown) => asserts state is TState =
    schemas.assertState;
  const assertDocument: (
    document: unknown,
  ) => asserts document is PHDocument<TState> = schemas.assertDocument;

  const utils: DocumentModelUtils<TState> = {
    fileExtension: plan.config.extension,
    createState(state) {
      const scopedState = state as
        | (typeof state & {
            readonly global?: Record<string, unknown>;
            readonly local?: Record<string, unknown>;
          })
        | undefined;
      return {
        ...createBaseState(state?.auth, {
          version: plan.config.version,
          ...state?.document,
        }),
        global: { ...initialGlobalState, ...scopedState?.global },
        local: { ...initialLocalState, ...scopedState?.local },
      } as unknown as TState;
    },
    createDocument(state) {
      return baseCreateDocument(utils.createState, state, plan.config.id);
    },
    saveToFileHandle(document, input) {
      return baseSaveToFileHandle(document, input);
    },
    loadFromInput(input) {
      return baseLoadFromInputVersioned(input, {
        reducers: options.reducers,
        upgradeManifest: options.upgradeManifest,
      }) as ReturnType<DocumentModelUtils<TState>["loadFromInput"]>;
    },
    isStateOfType(state): state is TState {
      return schemas.isState(state);
    },
    assertIsStateOfType(state): asserts state is TState {
      assertState(state);
    },
    isDocumentOfType(document): document is PHDocument<TState> {
      return schemas.isDocument(document);
    },
    assertIsDocumentOfType(document): asserts document is PHDocument<TState> {
      assertDocument(document);
    },
  };

  return {
    version: plan.config.version,
    reducer: behavior.reducer,
    actions: behavior.actions,
    utils,
    documentModel,
    definition,
  };
}

export function asBaseReducer(reducer: Reducer<any>): Reducer<PHBaseState> {
  return reducer as unknown as Reducer<PHBaseState>;
}
