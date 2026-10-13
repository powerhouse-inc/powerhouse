import type {
  Action,
  Actions,
  CodeExample,
  DefinitionDiagnostic,
  DocumentModelDefinition,
  DocumentModelGlobalState,
  DocumentModelModule,
  DocumentModelPHState,
  DocumentModelUtils,
  DocumentSpecification,
  ModuleSpecification,
  OperationSpecification,
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
  createState as createDocumentModelState,
  defaultBaseState,
  isDocumentAction,
  normalizeDocumentModelVersion,
} from "@powerhousedao/shared/document-model";
import { z } from "zod";
import type { CompatibilitySelection } from "./compatibility-apply.js";
import { recordPackageScalars } from "./scalars/package-scalars.js";
import type {
  CompiledDocumentModelVersion,
  CompiledOperation,
} from "./structured.js";

/**
 * Finalization: one ordinary `DocumentModelModule` with one additive
 * property. Existing consumers keep using `reducer`, `actions`, `utils`, and
 * `documentModel` and never learn the model was authored in TypeScript.
 *
 * Nothing here freezes the module or writes a file, and the reducer delegates
 * operation construction, metadata, rollback, and error recording to the
 * existing `createReducer` runtime rather than replacing it.
 */

export type CodeFirstDocumentModelModule<
  TState extends PHBaseState = PHBaseState,
  TActions extends Actions = Actions,
> = Omit<DocumentModelModule<TState>, "actions" | "version"> & {
  readonly version: number;
  readonly actions: TActions;
  readonly definition: DocumentModelDefinition;
};

export type CodeFirstRuntimeBehavior<
  TState extends PHBaseState = PHBaseState,
  TActions extends Actions = Actions,
> = {
  readonly reducer: Reducer<TState>;
  readonly actions: TActions;
};

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createActionCreator(operation: CompiledOperation) {
  const validator = () => operation.inputValidator;
  const create = (input: Record<string, unknown>): Action =>
    createAction(
      operation.actionType,
      // The creator passes a shallow enumerable-property clone, exactly as the
      // generated creators do, so unknown keys survive.
      { ...input },
      undefined,
      validator,
      operation.scope,
    );
  // An explicit empty input keeps the generated optional argument, so both
  // `actions.clear()` and `actions.clear({})` produce equal actions apart from
  // platform-assigned metadata.
  return operation.input.fields.length === 0
    ? (input: Record<string, unknown> = {}) => create(input)
    : (input: Record<string, unknown>) => create(input);
}

export function createCodeFirstRuntimeBehavior<
  TState extends PHBaseState = PHBaseState,
  TActions extends Actions = Actions,
>(
  plan: CompiledDocumentModelVersion,
): CodeFirstRuntimeBehavior<TState, TActions> {
  const operations = new Map<string, CompiledOperation>();
  const modelActions: Record<string, (...args: any[]) => Action> = {};
  for (const module of plan.modules) {
    for (const operation of module.operations) {
      // Duplicate derived action types are rejected during compilation: a
      // generated switch is first-match-wins while this table would be
      // last-write-wins, and the two approaches must not differ.
      operations.set(operation.actionType, operation);
      modelActions[operation.creatorKey] = createActionCreator(operation);
    }
  }

  const stateReducer: StateReducer<TState> = (state, action, dispatch) => {
    if (isDocumentAction(action)) return state as unknown as TState;
    const operation = operations.get(action.type);
    // An unknown action type is a no-op, not a throw.
    if (operation === undefined) return state as unknown as TState;
    // Validate, then dispatch, ignoring Zod's parsed copy: the reducer
    // receives the persisted input object.
    operation.inputValidator.parse(action.input);
    operation.declaration.reduce(
      // State is selected from the persisted action scope, not from the
      // declared operation scope. That routing is retained compatibility;
      // strict rejection is deferred to a shared protocol release.
      (state as unknown as Record<string, unknown>)[action.scope],
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
    // Base actions first, then the model creators, preserving the current
    // later-spread collision behavior.
    actions: { ...baseActions, ...modelActions } as unknown as TActions,
  };
}

function storedExamples(
  examples: readonly Omit<{ id: string; value: string }, never>[],
): CodeExample[] {
  return examples.map((example) => ({ id: example.id, value: example.value }));
}

function storedState(state: {
  readonly materialized: {
    readonly schema: string;
    readonly initialValue: string;
    readonly examples: readonly {
      readonly id: string;
      readonly value: string;
    }[];
  };
}): State {
  return {
    schema: state.materialized.schema,
    initialValue: state.materialized.initialValue,
    examples: storedExamples(state.materialized.examples),
  };
}

function storedOperation(operation: CompiledOperation): OperationSpecification {
  const definition = operation.definition;
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    schema: operation.inputSchema,
    template: definition.template,
    reducer: definition.reducer,
    errors: definition.errors.map((error) => ({
      id: error.id,
      code: error.code,
      name: error.name,
      description: error.description,
      template: error.template,
    })),
    examples: storedExamples(definition.examples),
    scope: definition.scope,
  };
}

function storedModule(module: {
  readonly definition: {
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
  };
  readonly operations: readonly CompiledOperation[];
}): ModuleSpecification {
  return {
    id: module.definition.id,
    name: module.definition.name,
    description: module.definition.description,
    operations: module.operations.map(storedOperation),
  };
}

function storedSpecification(
  plan: CompiledDocumentModelVersion,
): DocumentSpecification {
  return {
    version: plan.specification.version,
    state: {
      global: storedState(plan.specification.state.global),
      local: storedState(plan.specification.state.local),
    },
    modules: plan.modules.map(storedModule),
    changeLog: [...plan.specification.changeLog],
  };
}

/**
 * Every version module carries the complete ordered specification history, so
 * a family cannot publish one version with a partial view of it.
 */
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
    specifications: plans.map(storedSpecification),
  };
}

/** This version and the versions before it, in ascending order. */
export function predecessorsAndSelf(
  plan: CompiledDocumentModelVersion,
  plans: readonly CompiledDocumentModelVersion[],
): readonly CompiledDocumentModelVersion[] {
  return plans.filter(
    (candidate) => candidate.config.version <= plan.config.version,
  );
}

/** The document-model version stamped in a state's document scope. */
function stampedVersion(state: unknown): number {
  if (typeof state !== "object" || state === null) return 1;
  const documentScope = (state as { document?: unknown }).document;
  if (typeof documentScope !== "object" || documentScope === null) return 1;
  const version = (documentScope as { version?: unknown }).version;
  return normalizeDocumentModelVersion(
    typeof version === "number" ? version : undefined,
  );
}

type RuntimeSchemas = {
  readonly resolveState: (state: unknown) => z.ZodType;
  readonly resolveDocument: (document: unknown) => z.ZodType;
};

/**
 * Guards validate the global projection and the current header contract, and
 * a module with predecessors selects the schema from the stored document
 * version, normalizes the historical stamps, and falls back to its own schema
 * for an unrecognized version — matching the generated `document-schema.ts`.
 *
 * Only this version and its predecessors are known: the generated v1 module
 * imports no v2 schema, so a v1 module must not validate a v2-stamped state
 * against v2's schema.
 */
function createRuntimeSchemas(
  plan: CompiledDocumentModelVersion,
  plans: readonly CompiledDocumentModelVersion[],
): RuntimeSchemas {
  const header = BaseDocumentHeaderSchema.extend({
    documentType: z.literal(plan.config.id),
  });
  const states = new Map<number, z.ZodType>();
  const documents = new Map<number, z.ZodType>();
  for (const candidate of predecessorsAndSelf(plan, plans)) {
    const state = BaseDocumentStateSchema.extend({
      global: candidate.config.specifications.global.root.validator,
    });
    states.set(candidate.config.version, state);
    documents.set(
      candidate.config.version,
      z.object({ header, state, initialState: state }),
    );
  }
  const ownState = states.get(plan.config.version) as z.ZodType;
  const ownDocument = documents.get(plan.config.version) as z.ZodType;
  return {
    resolveState: (state) => states.get(stampedVersion(state)) ?? ownState,
    resolveDocument: (document) => {
      const state =
        typeof document === "object" && document !== null
          ? (document as { state?: unknown }).state
          : undefined;
      return documents.get(stampedVersion(state)) ?? ownDocument;
    },
  };
}

export function materializeCodeFirstModule<
  TState extends PHBaseState = PHBaseState,
  TActions extends Actions = Actions,
>(options: {
  readonly plan: CompiledDocumentModelVersion;
  readonly plans: readonly CompiledDocumentModelVersion[];
  readonly behavior: CodeFirstRuntimeBehavior<TState, TActions>;
  readonly reducers: Record<number, Reducer<PHBaseState>>;
  readonly upgradeManifest: UpgradeManifest<readonly number[]>;
}): CodeFirstDocumentModelModule<TState, TActions> {
  const { plan, plans, behavior } = options;
  const schemas = createRuntimeSchemas(plan, plans);
  const initialGlobalState = plan.initialGlobalState as Record<string, unknown>;
  const initialLocalState = plan.initialLocalState as Record<string, unknown>;

  // Each version module owns its copy, so mutating one module's stored state
  // cannot appear through another version's module.
  const documentModel: DocumentModelPHState = createDocumentModelState(
    defaultBaseState(),
    cloneJson(materializeGlobalState(plan, plans)),
  );
  const definition: DocumentModelDefinition = cloneJson({
    ...plan.definition,
    specifications: plans.map((candidate) => candidate.specification),
  });

  const utils: DocumentModelUtils<TState> = {
    fileExtension: plan.config.extension,
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
          version: plan.config.version,
          ...scoped?.document,
        }),
        global: { ...cloneJson(initialGlobalState), ...scoped?.global },
        local: { ...cloneJson(initialLocalState), ...scoped?.local },
      } as unknown as TState;
    },
    createDocument(state) {
      return baseCreateDocument(utils.createState, state, plan.config.id);
    },
    saveToFileHandle(document, input) {
      return baseSaveToFileHandle(document, input);
    },
    loadFromInput(input) {
      // Version-aware loading closes over every prior reducer and the family
      // upgrade manifest.
      return baseLoadFromInputVersioned<TState>(input, {
        reducers: options.reducers,
        upgradeManifest: options.upgradeManifest,
      });
    },
    isStateOfType(state): state is TState {
      return schemas.resolveState(state).safeParse(state).success;
    },
    assertIsStateOfType(state): asserts state is TState {
      schemas.resolveState(state).parse(state);
    },
    isDocumentOfType(document): document is PHDocument<TState> {
      return schemas.resolveDocument(document).safeParse(document).success;
    },
    assertIsDocumentOfType(document): asserts document is PHDocument<TState> {
      schemas.resolveDocument(document).parse(document);
    },
  };

  const module = {
    version: plan.config.version,
    reducer: behavior.reducer,
    actions: behavior.actions,
    utils,
    documentModel,
    definition,
  };
  recordCompilation(module, {
    diagnostics: plan.diagnostics,
    compatibility: plan.compatibility,
  });
  // Every version's: the definition carries each version's specification, and
  // the host serves the latest one it projects.
  recordPackageScalars(module, [
    ...new Set(plans.flatMap((candidate) => candidate.packageScalars)),
  ]);
  return module;
}

/**
 * What compilation observed but did not fail on: the report-only diagnostics
 * it raised, and which compatibility modes the declaration selected.
 *
 * The V1 wire shape is closed, so this cannot live on `definition`, and
 * throwing is wrong — a report-only code exists precisely to be reported
 * without stopping a declaration. Keeping it beside the module lets
 * `checkDefinitions` and `ph model inspect` surface it; a consumer that
 * never asks is unaffected.
 */
export type ModuleCompilationReport = {
  readonly diagnostics: readonly DefinitionDiagnostic[];
  readonly compatibility: CompatibilitySelection;
};

/**
 * One registry, shared by every copy of this package in the process.
 *
 * A definition source resolves its own `document-model`, and a package can
 * easily end up with two installs — a pinned copy, a linked workspace, a build
 * tool that transforms one of them. A registry private to each copy would then
 * answer "no report" for a module the other copy compiled, and every
 * report-only diagnostic and compatibility selection a declaration carries
 * would vanish exactly when a check went looking for it. The report is plain
 * data, so reading one another copy wrote is safe.
 */
const REGISTRY_KEY = Symbol.for(
  "powerhouse.document-model.compilation-reports",
);

const globalRegistry = globalThis as unknown as {
  [REGISTRY_KEY]?: WeakMap<object, ModuleCompilationReport>;
};

const compilationReports: WeakMap<object, ModuleCompilationReport> =
  globalRegistry[REGISTRY_KEY] ??
  (globalRegistry[REGISTRY_KEY] = new WeakMap<
    object,
    ModuleCompilationReport
  >());

function recordCompilation(
  module: object,
  report: ModuleCompilationReport,
): void {
  compilationReports.set(module, report);
}

export function compilationReportOf(
  module: unknown,
): ModuleCompilationReport | undefined {
  return module !== null && typeof module === "object"
    ? compilationReports.get(module)
    : undefined;
}
