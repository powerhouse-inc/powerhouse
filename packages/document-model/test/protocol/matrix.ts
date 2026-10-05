import type {
  Action,
  DocumentModelGlobalState,
  DocumentModelModule,
  PHBaseState,
  PHDocument,
  Reducer,
  ReducerOptions,
  SignalDispatch,
  StateReducer,
} from "@powerhousedao/shared/document-model";
import {
  baseActions,
  baseCreateDocument,
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
  baseSaveToFileHandle,
  createAction,
  createBaseState,
  createReducer,
  createState,
  defaultBaseState,
  isDocumentAction,
} from "@powerhousedao/shared/document-model";
import { z } from "zod";
import { ph } from "../../src/definition/field.js";
import { defineDocumentModel } from "../../src/definition/model.js";
import {
  TaskFamily,
  TaskV1,
  TaskV2,
} from "../definition/fixtures/family-model.js";
import {
  schemaFirstTaskV1,
  schemaFirstTaskV2,
  schemaFirstUpgradeManifest,
} from "../definition/fixtures/family-parity.js";
import {
  codeFirstParity,
  schemaFirstParity,
} from "../definition/fixtures/parity-model.js";

/**
 * The committed protocol behavior table. Replay covers histories; this covers
 * the edges — every route into a reducer and every outcome it can produce —
 * so that no route silently loses coverage.
 *
 * Every row is data: the subject it runs against, the route that reaches the
 * reducer, the stored document version, the action scope, the raw input, the
 * compatibility mode, and the complete expected outcome. `matrix.test.ts`
 * runs each row against the schema-first and the code-first module and
 * compares both against the row and against each other.
 */

// ─── Subjects ────────────────────────────────────────────────────────────

/**
 * The module surface the runner drives. `Reducer<TState>` is contravariant in
 * its document parameter (see `finalize.test.ts`), so a heterogeneous table of
 * modules needs one widening per module instead of a cast at every call site.
 */
export type ProtocolModule = {
  readonly version: number;
  readonly reducer: (
    document: PHDocument,
    action: Action,
    dispatch?: SignalDispatch,
    options?: ReducerOptions,
  ) => PHDocument;
  readonly actions: Readonly<
    Record<string, ((...args: never[]) => Action) | undefined>
  >;
  readonly utils: { readonly createDocument: () => PHDocument };
  readonly documentModel: { readonly global: DocumentModelGlobalState };
};

function protocolModule<TState extends PHBaseState>(
  module: DocumentModelModule<TState>,
): ProtocolModule {
  return module as unknown as ProtocolModule;
}

/** What a reducer recorded about a domain error before throwing it. */
export type CapturedError = {
  readonly errorCode: string;
  readonly name: string;
  readonly message: string;
};

// ── The ledger: a counter with one domain error, declared both ways ──
//
// `parity-model.ts` declares no operation errors, and a domain-error row has
// to compare the reducer-facing `errorCode` against the stored specification
// `code`. The pair below is the smallest model that carries both.

export type LedgerGlobalState = { __typename?: "LedgerState"; count: number };
export type LedgerLocalState = Record<PropertyKey, never>;
export type LedgerPHState = PHBaseState & {
  global: LedgerGlobalState;
  local: LedgerLocalState;
};

const ledgerDocumentType = "test/protocol-ledger";

export const capturedSchemaFirstLedgerErrors: CapturedError[] = [];
export const capturedCodeFirstLedgerErrors: CapturedError[] = [];

/**
 * The thrown class never reaches the history — only its message does — so the
 * reducers record it on the way out. `parity-model.ts` records its inputs the
 * same way.
 */
function record<TError extends Error & { readonly errorCode: string }>(
  sink: CapturedError[],
  error: TError,
): TError {
  sink.push({
    errorCode: error.errorCode,
    name: error.name,
    message: error.message,
  });
  return error;
}

// gen/schema/zod.ts
function LedgerStateSchema() {
  return z.object({
    __typename: z.literal("LedgerState").optional(),
    count: z.number(),
  });
}

function CreditInputSchema() {
  return z.object({ by: z.number() });
}

// gen/ledger-entries/error.ts — the generated class derives its name, its
// `errorCode`, and its default message from the Pascal-cased stored `name`.
class LimitReached extends Error {
  errorCode = "LimitReached";
  constructor(message = "LimitReached") {
    super(message);
  }
}

// gen/ledger-entries/creators.ts
const credit = (input: { by: number }): Action =>
  createAction("CREDIT", { ...input }, undefined, CreditInputSchema, "global");

// src/reducers/ledger-entries.ts
const ledgerOperations = {
  creditOperation(state: LedgerGlobalState, action: Action) {
    const input = action.input as { by: number };
    if (input.by > 10) {
      throw record(capturedSchemaFirstLedgerErrors, new LimitReached());
    }
    if (input.by < 0) {
      throw record(
        capturedSchemaFirstLedgerErrors,
        new LimitReached("negative credit"),
      );
    }
    state.count += input.by;
  },
};

// gen/reducer.ts
const ledgerStateReducer: StateReducer<LedgerPHState> = (state, action) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "CREDIT": {
      CreditInputSchema().parse(action.input);
      ledgerOperations.creditOperation(
        (state as unknown as Record<string, LedgerGlobalState>)[action.scope],
        action,
      );
      break;
    }
    default:
      return state;
  }
};

// gen/document-schema.ts
const LedgerPHStateSchema = BaseDocumentStateSchema.extend({
  global: LedgerStateSchema(),
});
const LedgerDocumentSchema = z.object({
  header: BaseDocumentHeaderSchema.extend({
    documentType: z.literal(ledgerDocumentType),
  }),
  state: LedgerPHStateSchema,
  initialState: LedgerPHStateSchema,
});

// gen/utils.ts
const ledgerUtils: DocumentModelModule<LedgerPHState>["utils"] = {
  fileExtension: "ledger",
  createState(state) {
    const scoped = state as Partial<LedgerPHState> | undefined;
    return {
      ...createBaseState(scoped?.auth, { version: 1, ...scoped?.document }),
      global: { count: 0, ...scoped?.global },
      local: { ...scoped?.local },
    } as LedgerPHState;
  },
  createDocument(state) {
    return baseCreateDocument(
      ledgerUtils.createState,
      state,
      ledgerDocumentType,
    );
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput() {
    throw new Error("not used by the protocol matrix");
  },
  isStateOfType(state): state is LedgerPHState {
    return LedgerPHStateSchema.safeParse(state).success;
  },
  assertIsStateOfType(state): asserts state is LedgerPHState {
    LedgerPHStateSchema.parse(state);
  },
  isDocumentOfType(document): document is PHDocument<LedgerPHState> {
    return LedgerDocumentSchema.safeParse(document).success;
  },
  assertIsDocumentOfType(
    document,
  ): asserts document is PHDocument<LedgerPHState> {
    LedgerDocumentSchema.parse(document);
  },
};

const ledgerDocumentModel: DocumentModelGlobalState = {
  id: ledgerDocumentType,
  name: "Ledger",
  author: { name: "Powerhouse", website: null },
  extension: "ledger",
  description: "A counter with one domain error.",
  specifications: [
    {
      version: 1,
      state: {
        global: {
          schema: "type LedgerState {\n  count: Int!\n}",
          initialValue: '{"count":0}',
          examples: [],
        },
        local: { schema: "", initialValue: "{}", examples: [] },
      },
      modules: [
        {
          id: "module-ledger-entries",
          name: "entries",
          description: "",
          operations: [
            {
              id: "operation-credit",
              name: "CREDIT",
              description: "",
              schema: "input CreditInput {\n  by: Int!\n}",
              template: "",
              reducer: "",
              errors: [
                {
                  id: "error-limit-reached",
                  code: "LIMIT_REACHED",
                  name: "LimitReached",
                  description: "The ledger is at its limit.",
                  template: null,
                },
              ],
              examples: [],
              scope: "global",
            },
          ],
        },
      ],
      changeLog: [],
    },
  ],
};

export const schemaFirstLedger = {
  version: 1,
  reducer: createReducer(ledgerStateReducer) as Reducer<LedgerPHState>,
  actions: { ...baseActions, credit },
  utils: ledgerUtils,
  documentModel: createState(defaultBaseState(), ledgerDocumentModel),
} as const satisfies DocumentModelModule<LedgerPHState>;

const ledger = defineDocumentModel({
  id: ledgerDocumentType,
  name: "Ledger",
  description: "A counter with one domain error.",
  extension: "ledger",
  version: 1,
  author: { name: "Powerhouse" },
  specifications: {
    global: {
      schema: ph.object("LedgerState", {
        fields: { count: ph.Int({ required: true }) },
      }),
      initialValue: { count: 0 },
    },
    local: { schema: null, initialValue: {} },
  },
});

const ledgerEntries = ledger.module("entries", {
  operations: ({ global }) => ({
    credit: global({
      input: ph.input({ fields: { by: ph.Int({ required: true }) } }),
      errors: {
        LimitReached: {
          code: "LIMIT_REACHED",
          description: "The ledger is at its limit.",
        },
      },
      reduce(state, input, ctx) {
        if (input.by > 10) {
          throw record(
            capturedCodeFirstLedgerErrors,
            new ctx.errors.LimitReached(),
          );
        }
        if (input.by < 0) {
          throw record(
            capturedCodeFirstLedgerErrors,
            new ctx.errors.LimitReached("negative credit"),
          );
        }
        state.count += input.by;
      },
    }),
  }),
});

export const codeFirstLedger = ledger.finalize({ modules: [ledgerEntries] });

export type SubjectId = "parity" | "ledger" | "task-v1" | "task-v2";

export type Subject = {
  readonly schemaFirst: ProtocolModule;
  readonly codeFirst: ProtocolModule;
  /** Domain errors the two reducers recorded, newest last. */
  readonly capturedErrors: {
    readonly schemaFirst: CapturedError[];
    readonly codeFirst: CapturedError[];
  };
};

export const SUBJECTS: Readonly<Record<SubjectId, Subject>> = {
  parity: {
    schemaFirst: protocolModule(schemaFirstParity),
    codeFirst: protocolModule(codeFirstParity),
    capturedErrors: { schemaFirst: [], codeFirst: [] },
  },
  ledger: {
    schemaFirst: protocolModule(schemaFirstLedger),
    codeFirst: protocolModule(codeFirstLedger),
    capturedErrors: {
      schemaFirst: capturedSchemaFirstLedgerErrors,
      codeFirst: capturedCodeFirstLedgerErrors,
    },
  },
  "task-v1": {
    schemaFirst: protocolModule(schemaFirstTaskV1),
    codeFirst: protocolModule(TaskV1),
    capturedErrors: { schemaFirst: [], codeFirst: [] },
  },
  "task-v2": {
    schemaFirst: protocolModule(schemaFirstTaskV2),
    codeFirst: protocolModule(TaskV2),
    capturedErrors: { schemaFirst: [], codeFirst: [] },
  },
};

/** The families the two approaches declare version by version. */
export const TASK_FAMILY = {
  schemaFirst: {
    modules: [schemaFirstTaskV1, schemaFirstTaskV2],
    upgradeManifest: schemaFirstUpgradeManifest,
  },
  codeFirst: {
    modules: [TaskV1, TaskV2],
    upgradeManifest: TaskFamily.upgradeManifest,
  },
} as const;

// ─── Row shape ───────────────────────────────────────────────────────────

/**
 * How the row's action reaches the reducer. `definition` rows dispatch
 * nothing: they pin what a model rejects or selects before any history
 * exists. Task 033 adds the GraphQL route for the applicable cases.
 */
export type Route = "creator" | "raw-action" | "archived-replay" | "definition";

/**
 * `core-v1-retained` marks a row that pins behavior this release keeps on
 * purpose. Its correction is the deferred X-protocol work in
 * `.tasks/README.md`, so a row that starts failing after an unrelated change
 * is a signal, not a passing repair.
 */
export type CompatibilityMode = "core-v1" | "core-v1-retained";

export type Outcome =
  /** The operation is recorded; its reducer ran, or it matched no case. */
  | "applied"
  /** The reducer threw; the message is on the operation and state rolled back. */
  | "reducer-error"
  /** Authorization rejected it; the operation holds its index, unapplied. */
  | "denied"
  /** The creator threw; no action and no operation exist. */
  | "creator-rejected"
  /** The dispatch threw; the document is unchanged. */
  | "reducer-rejected";

export type HashDelta =
  /** A fresh hash over the resulting scope state. */
  | "computed"
  /** The stored hash, copied verbatim from the archived operation. */
  | "carried"
  /** A meta operation, which returns before the hash step. */
  | "empty"
  /** No operation was appended. */
  | "none";

export type ExpectedErrors = {
  /** The message the creator throws, or null when it accepts the input. */
  readonly creatorRejection: string | null;
  /** `operation.error` on the row's operation. */
  readonly operationError: string | null;
  /** The message the dispatch throws out, or null. */
  readonly reducerRejection: string | null;
  /** The reason authorization recorded, or null. */
  readonly deniedReason: string | null;
  /** The reducer-facing `errorCode` of the thrown domain error. */
  readonly errorCode: string | null;
  /** `error.name` on the thrown domain error. */
  readonly errorName: string | null;
  /**
   * The stored `OperationErrorSpecification.code` of the row's operation.
   * Compared separately from `errorCode`: they are allowed to differ.
   */
  readonly specificationCode: string | null;
};

export const NO_ERRORS: ExpectedErrors = {
  creatorRejection: null,
  operationError: null,
  reducerRejection: null,
  deniedReason: null,
  errorCode: null,
  errorName: null,
  specificationCode: null,
};

export type ExpectedOutcome = {
  readonly outcome: Outcome;
  /** Every non-base scope of the resulting state, by scope name. */
  readonly state: Readonly<Record<string, unknown>>;
  readonly hash: HashDelta;
  readonly errors: ExpectedErrors;
  /** Signal types the reducer dispatched, in order. */
  readonly dispatches: readonly string[];
};

/** A row where the two approaches do not agree, and why. */
export type Divergence = {
  readonly reason: string;
  /** The schema-first expectation, replacing the row's own members. */
  readonly schemaFirst: Partial<ExpectedOutcome>;
};

export type DispatchRow = {
  readonly id: string;
  /** The task-table case this row belongs to; see `REQUIRED_ROUTES`. */
  readonly caseKey: CaseKey;
  readonly subject: SubjectId;
  readonly route: "creator" | "raw-action" | "archived-replay";
  /**
   * The version the document carries. `undefined`, `null`, and `0` all
   * resolve to version 1.
   */
  readonly documentVersion: number | null | undefined;
  /** The persisted action scope, which is not always the declared one. */
  readonly scope: string;
  readonly actionType: string;
  readonly input: unknown;
  readonly compatibility: CompatibilityMode;
  /** Actions applied before the row's own, by creator key and arguments. */
  readonly setup?: readonly (readonly [string, ...unknown[]])[];
  /** The creator key the `creator` route calls. */
  readonly creator?: string;
  /** Positional arguments, for the base creators that do not take one input. */
  readonly creatorArgs?: readonly unknown[];
  readonly options?: ReducerOptions;
  /** Members patched onto the archived operation before it is replayed. */
  readonly archived?: {
    readonly deniedReason?: string;
    readonly skip?: number;
  };
  /**
   * Operations appended to the archived history after the row's own. A
   * stream can carry a history shape the live reducer garbage-collects away,
   * and C3.2 requires core v1 to accept it.
   */
  readonly archivedAppend?: readonly ArchivedOperationSpec[];
  /**
   * Drops the global scope from the stored history. `createDocument` always
   * seeds it, but a stored history need not carry it, and it is the one
   * shape that tells reading global history apart from reading the scope the
   * action names.
   */
  readonly withoutGlobalHistory?: true;
  /** The action context the persisted action carries. */
  readonly context?: Action["context"];
  readonly expected: ExpectedOutcome;
  readonly divergence?: Divergence;
};

/** One operation of an archived history, written directly. */
export type ArchivedOperationSpec = {
  readonly type: string;
  readonly scope: string;
  readonly input: unknown;
  readonly index: number;
  readonly skip: number;
};

/** What a `definition` row asserts, before any document exists. */
export type DefinitionCheck =
  | { readonly kind: "stored-version"; readonly resolvesTo: 1 }
  | { readonly kind: "version-selection" }
  | { readonly kind: "upgrade-edges"; readonly edges: readonly number[] }
  | {
      readonly kind: "duplicate-action-type";
      /** The action type two operations of different modules both derive. */
      readonly actionType: string;
      readonly codeFirst: "PH-DM-DUPLICATE-ACTION";
      /**
       * Both adapters run the same collision check over the complete model,
       * because a generated `switch` is first-match-wins while an object
       * table is last-write-wins: normalizing the collision on either side
       * would make the two approaches observably differ.
       */
      readonly schemaFirst: "reported";
      readonly sharedChecker: "PH-DM-DUPLICATE-ACTION";
    };

export type DefinitionRow = {
  readonly id: string;
  readonly caseKey: CaseKey;
  readonly subject: SubjectId;
  readonly route: "definition";
  readonly documentVersion: number | null | undefined;
  readonly compatibility: CompatibilityMode;
  readonly check: DefinitionCheck;
  readonly divergenceReason?: string;
};

export type MatrixRow = DispatchRow | DefinitionRow;

// ─── Committed values ────────────────────────────────────────────────────

/** The persisted message of a rejected `ADD_TODO` input, byte for byte. */
const ADD_TODO_ID_NOT_A_STRING = `[
  {
    "expected": "string",
    "code": "invalid_type",
    "path": [
      "id"
    ],
    "message": "Invalid input: expected string, received number"
  }
]`;

const ADD_TODO_CREATOR_REJECTION = `Invalid action input: [
  {
    "expected": "boolean",
    "code": "invalid_type",
    "path": [
      "completed"
    ],
    "message": "Invalid input: expected boolean, received undefined"
  },
  {
    "expected": "string",
    "code": "invalid_type",
    "path": [
      "id"
    ],
    "message": "Invalid input: expected string, received number"
  },
  {
    "expected": "string",
    "code": "invalid_type",
    "path": [
      "title"
    ],
    "message": "Invalid input: expected string, received undefined"
  }
]`;

/** The persisted message when an action carries no input at all. */
const CLEAR_WITHOUT_INPUT = `[
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [],
    "message": "Invalid input: expected object, received undefined"
  }
]`;

const NESTED_UNKNOWN_KEYS = {
  id: "todo-extra",
  title: "extra",
  completed: false,
  meta: { depth1: { depth2: { depth3: "kept" } } },
};

const PARITY_EMPTY = {
  global: { title: "", todos: [] },
  local: { note: null },
};

function parityWith(todos: readonly unknown[], note: string | null = null) {
  return { global: { title: "", todos }, local: { note } };
}

const TODO_A = { id: "a", title: "A", completed: false };
const TODO_B = { id: "b", title: "B", completed: false };

const DENIED_REASON = "no grant permits this operation";

// ─── The table ───────────────────────────────────────────────────────────

const INVALID_INPUT_ROWS: readonly DispatchRow[] = [
  {
    id: "invalid-input/creator",
    caseKey: "invalid-input",
    subject: "parity",
    route: "creator",
    documentVersion: 1,
    scope: "global",
    actionType: "ADD_TODO",
    input: { id: 1 },
    compatibility: "core-v1",
    creator: "addTodo",
    expected: {
      outcome: "creator-rejected",
      state: PARITY_EMPTY,
      hash: "none",
      errors: { ...NO_ERRORS, creatorRejection: ADD_TODO_CREATOR_REJECTION },
      dispatches: [],
    },
  },
  {
    id: "invalid-input/raw-action",
    caseKey: "invalid-input",
    subject: "parity",
    route: "raw-action",
    documentVersion: 1,
    scope: "global",
    actionType: "ADD_TODO",
    input: { id: 1, title: "A", completed: false },
    compatibility: "core-v1",
    expected: {
      outcome: "reducer-error",
      state: PARITY_EMPTY,
      hash: "computed",
      errors: { ...NO_ERRORS, operationError: ADD_TODO_ID_NOT_A_STRING },
      dispatches: [],
    },
  },
  {
    id: "invalid-input/archived-replay",
    caseKey: "invalid-input",
    subject: "parity",
    route: "archived-replay",
    documentVersion: 1,
    scope: "global",
    actionType: "ADD_TODO",
    input: { id: 1, title: "A", completed: false },
    compatibility: "core-v1",
    expected: {
      outcome: "reducer-error",
      state: PARITY_EMPTY,
      hash: "carried",
      errors: { ...NO_ERRORS, operationError: ADD_TODO_ID_NOT_A_STRING },
      dispatches: [],
    },
  },
];

const EXTRA_KEY_ROWS: readonly DispatchRow[] = [
  {
    id: "extra-unknown-keys/creator",
    caseKey: "extra-unknown-keys",
    subject: "parity",
    route: "creator",
    documentVersion: 1,
    scope: "global",
    actionType: "ADD_TODO",
    input: NESTED_UNKNOWN_KEYS,
    compatibility: "core-v1",
    creator: "addTodo",
    expected: {
      outcome: "applied",
      state: parityWith([
        { id: "todo-extra", title: "extra", completed: false },
      ]),
      hash: "computed",
      errors: NO_ERRORS,
      dispatches: [],
    },
  },
  {
    id: "extra-unknown-keys/raw-action",
    caseKey: "extra-unknown-keys",
    subject: "parity",
    route: "raw-action",
    documentVersion: 1,
    scope: "global",
    actionType: "ADD_TODO",
    input: NESTED_UNKNOWN_KEYS,
    compatibility: "core-v1",
    expected: {
      outcome: "applied",
      state: parityWith([
        { id: "todo-extra", title: "extra", completed: false },
      ]),
      hash: "computed",
      errors: NO_ERRORS,
      dispatches: [],
    },
  },
  {
    id: "extra-unknown-keys/archived-replay",
    caseKey: "extra-unknown-keys",
    subject: "parity",
    route: "archived-replay",
    documentVersion: 1,
    scope: "global",
    actionType: "ADD_TODO",
    input: NESTED_UNKNOWN_KEYS,
    compatibility: "core-v1",
    expected: {
      outcome: "applied",
      state: parityWith([
        { id: "todo-extra", title: "extra", completed: false },
      ]),
      hash: "carried",
      errors: NO_ERRORS,
      dispatches: [],
    },
  },
];

/**
 * `SET_NOTE` is declared on the local scope. Both reducers select state with
 * the persisted scope, so a global-scoped `SET_NOTE` writes `note` into the
 * global state and leaves the local state alone.
 *
 * This is retained compatibility, not a defect to repair here: C3.9 keeps
 * incoming-scope routing in core v1 and defers strict mismatch rejection to
 * X-protocol ("`checkHashes` semantics, strict scopes, prune-by-scope" in the
 * deferred table of `.tasks/README.md`), where both implementations reject
 * before state selection and history append. The reserved non-passing
 * artifact for that release is `wrong-scope/strict-protocol`.
 */
const WRONG_SCOPE_ROWS: readonly DispatchRow[] = [
  {
    id: "wrong-scope/raw-action",
    caseKey: "wrong-scope",
    subject: "parity",
    route: "raw-action",
    documentVersion: 1,
    scope: "global",
    actionType: "SET_NOTE",
    input: { note: "hello" },
    compatibility: "core-v1-retained",
    expected: {
      outcome: "applied",
      state: {
        global: { title: "", todos: [], note: "hello" },
        local: { note: null },
      },
      hash: "computed",
      errors: NO_ERRORS,
      dispatches: [],
    },
  },
  {
    id: "wrong-scope/archived-replay",
    caseKey: "wrong-scope",
    subject: "parity",
    route: "archived-replay",
    documentVersion: 1,
    scope: "global",
    actionType: "SET_NOTE",
    input: { note: "hello" },
    compatibility: "core-v1-retained",
    expected: {
      outcome: "applied",
      state: {
        global: { title: "", todos: [], note: "hello" },
        local: { note: null },
      },
      hash: "carried",
      errors: NO_ERRORS,
      dispatches: [],
    },
  },
];

/**
 * C3.6 keeps the runtime scope set open. An unknown scope selects no state,
 * so the authored reducer fails on it, the operation is recorded under that
 * scope, and the declared scopes are untouched.
 */
const UNKNOWN_SCOPE_ROWS: readonly DispatchRow[] = [
  {
    id: "unknown-runtime-scope/raw-action",
    caseKey: "unknown-runtime-scope",
    subject: "parity",
    route: "raw-action",
    documentVersion: 1,
    scope: "reporting",
    actionType: "ADD_TODO",
    input: TODO_A,
    compatibility: "core-v1",
    expected: {
      outcome: "reducer-error",
      state: PARITY_EMPTY,
      hash: "computed",
      errors: {
        ...NO_ERRORS,
        operationError: "Cannot read properties of undefined (reading 'todos')",
      },
      dispatches: [],
    },
  },
  {
    id: "unknown-runtime-scope/archived-replay",
    caseKey: "unknown-runtime-scope",
    subject: "parity",
    route: "archived-replay",
    documentVersion: 1,
    scope: "reporting",
    actionType: "ADD_TODO",
    input: TODO_A,
    compatibility: "core-v1",
    expected: {
      outcome: "reducer-error",
      state: PARITY_EMPTY,
      hash: "carried",
      errors: {
        ...NO_ERRORS,
        operationError: "Cannot read properties of undefined (reading 'todos')",
      },
      dispatches: [],
    },
  },
];

/**
 * C3.10: the current generator emits no creator for an operation with no
 * input schema, and core v1 adds none, so an input-less action only ever
 * arrives raw or from a history. Both reducers validate it again and reject.
 */
const NO_INPUT_ROWS: readonly DispatchRow[] = [
  {
    id: "no-input-operation/raw-action",
    caseKey: "no-input-operation",
    subject: "parity",
    route: "raw-action",
    documentVersion: 1,
    scope: "global",
    actionType: "CLEAR",
    input: undefined,
    compatibility: "core-v1",
    expected: {
      outcome: "reducer-error",
      state: PARITY_EMPTY,
      hash: "computed",
      errors: { ...NO_ERRORS, operationError: CLEAR_WITHOUT_INPUT },
      dispatches: [],
    },
  },
  {
    id: "no-input-operation/archived-replay",
    caseKey: "no-input-operation",
    subject: "parity",
    route: "archived-replay",
    documentVersion: 1,
    scope: "global",
    actionType: "CLEAR",
    input: undefined,
    compatibility: "core-v1",
    expected: {
      outcome: "reducer-error",
      state: PARITY_EMPTY,
      hash: "carried",
      errors: { ...NO_ERRORS, operationError: CLEAR_WITHOUT_INPUT },
      dispatches: [],
    },
  },
];

/** An action no module declares is recorded and changes nothing. */
const UNKNOWN_ACTION_ROWS: readonly DispatchRow[] = [
  {
    id: "unknown-action-type/raw-action",
    caseKey: "unknown-action-type",
    subject: "parity",
    route: "raw-action",
    documentVersion: 1,
    scope: "global",
    actionType: "NOT_A_MODEL_ACTION",
    input: { title: "ignored" },
    compatibility: "core-v1",
    expected: {
      outcome: "applied",
      state: PARITY_EMPTY,
      hash: "computed",
      errors: NO_ERRORS,
      dispatches: [],
    },
  },
  {
    id: "unknown-action-type/archived-replay",
    caseKey: "unknown-action-type",
    subject: "parity",
    route: "archived-replay",
    documentVersion: 1,
    scope: "global",
    actionType: "NOT_A_MODEL_ACTION",
    input: { title: "ignored" },
    compatibility: "core-v1",
    expected: {
      outcome: "applied",
      state: PARITY_EMPTY,
      hash: "carried",
      errors: NO_ERRORS,
      dispatches: [],
    },
  },
];

const LEDGER_LIMIT_ERRORS: ExpectedErrors = {
  ...NO_ERRORS,
  operationError: "LimitReached",
  errorCode: "LimitReached",
  errorName: "Error",
  specificationCode: "LIMIT_REACHED",
};

const DOMAIN_ERROR_ROWS: readonly DispatchRow[] = [
  {
    id: "domain-error-default-message/creator",
    caseKey: "domain-error-default-message",
    subject: "ledger",
    route: "creator",
    documentVersion: 1,
    scope: "global",
    actionType: "CREDIT",
    input: { by: 11 },
    compatibility: "core-v1",
    creator: "credit",
    expected: {
      outcome: "reducer-error",
      state: { global: { count: 0 }, local: {} },
      hash: "computed",
      errors: LEDGER_LIMIT_ERRORS,
      dispatches: [],
    },
  },
  {
    id: "domain-error-default-message/raw-action",
    caseKey: "domain-error-default-message",
    subject: "ledger",
    route: "raw-action",
    documentVersion: 1,
    scope: "global",
    actionType: "CREDIT",
    input: { by: 11 },
    compatibility: "core-v1",
    expected: {
      outcome: "reducer-error",
      state: { global: { count: 0 }, local: {} },
      hash: "computed",
      errors: LEDGER_LIMIT_ERRORS,
      dispatches: [],
    },
  },
  {
    id: "domain-error-default-message/archived-replay",
    caseKey: "domain-error-default-message",
    subject: "ledger",
    route: "archived-replay",
    documentVersion: 1,
    scope: "global",
    actionType: "CREDIT",
    input: { by: 11 },
    compatibility: "core-v1",
    expected: {
      outcome: "reducer-error",
      state: { global: { count: 0 }, local: {} },
      hash: "carried",
      errors: LEDGER_LIMIT_ERRORS,
      dispatches: [],
    },
  },
  {
    id: "domain-error-explicit-message/creator",
    caseKey: "domain-error-explicit-message",
    subject: "ledger",
    route: "creator",
    documentVersion: 1,
    scope: "global",
    actionType: "CREDIT",
    input: { by: -1 },
    compatibility: "core-v1",
    creator: "credit",
    expected: {
      outcome: "reducer-error",
      state: { global: { count: 0 }, local: {} },
      hash: "computed",
      errors: {
        ...LEDGER_LIMIT_ERRORS,
        operationError: "negative credit",
      },
      dispatches: [],
    },
  },
];

/**
 * A denied operation holds its index and contributes no state, so the hash it
 * carries is the hash of a state the replay never reaches. P1 is the reason
 * the carried hash is recorded rather than trusted.
 */
const DENIAL_ROWS: readonly DispatchRow[] = [
  {
    id: "denial/archived-replay",
    caseKey: "denial",
    subject: "parity",
    route: "archived-replay",
    documentVersion: 1,
    scope: "global",
    actionType: "ADD_TODO",
    input: TODO_A,
    compatibility: "core-v1",
    archived: { deniedReason: DENIED_REASON },
    expected: {
      outcome: "denied",
      state: PARITY_EMPTY,
      hash: "carried",
      errors: { ...NO_ERRORS, deniedReason: DENIED_REASON },
      dispatches: [],
    },
  },
];

const LOAD_ROWS: readonly DispatchRow[] = [
  {
    id: "load/raw-action",
    caseKey: "load",
    subject: "parity",
    route: "raw-action",
    documentVersion: 1,
    scope: "global",
    actionType: "LOAD_STATE",
    input: {
      operations: 0,
      state: {
        name: "loaded",
        data: { global: { title: "loaded", todos: [] }, local: { note: "l" } },
      },
    },
    compatibility: "core-v1",
    expected: {
      outcome: "applied",
      // Legacy LOAD_STATE no longer has reducer handling.
      state: PARITY_EMPTY,
      hash: "computed",
      errors: NO_ERRORS,
      dispatches: [],
    },
  },
  {
    id: "load/creator",
    caseKey: "load",
    subject: "parity",
    route: "creator",
    documentVersion: 1,
    scope: "global",
    actionType: "LOAD_STATE",
    // Retained input shape from the removed loadState creator.
    input: { name: "loaded", ...PARITY_EMPTY },
    compatibility: "core-v1-retained",
    creator: "loadState",
    creatorArgs: [{ name: "loaded", ...PARITY_EMPTY }, 0],
    expected: {
      outcome: "creator-rejected",
      state: PARITY_EMPTY,
      hash: "none",
      errors: {
        ...NO_ERRORS,
        creatorRejection: "the actions map has no creator loadState",
      },
      dispatches: [],
    },
  },
];

/**
 * C3.2: core v1 accepts a protocol-v1 history that reuses an index while
 * `skip` increases. The live reducer collects the superseded rows away as it
 * goes, so the creator row shows the reuse across two consecutive undos and
 * the archived row replays the stream shape itself.
 */
const UNDO_ROWS: readonly DispatchRow[] = [
  {
    id: "duplicate-index-undo/creator",
    caseKey: "duplicate-index-undo",
    subject: "parity",
    route: "creator",
    documentVersion: 1,
    scope: "global",
    actionType: "UNDO",
    input: { count: 1 },
    compatibility: "core-v1",
    setup: [
      ["addTodo", TODO_A],
      ["addTodo", TODO_B],
      ["undo", 1],
    ],
    creator: "undo",
    creatorArgs: [1],
    options: { protocolVersion: 1 },
    expected: {
      outcome: "applied",
      state: PARITY_EMPTY,
      hash: "empty",
      errors: NO_ERRORS,
      dispatches: [],
    },
  },
  {
    id: "duplicate-index-undo/archived-replay",
    caseKey: "duplicate-index-undo",
    subject: "parity",
    route: "archived-replay",
    documentVersion: 1,
    scope: "global",
    actionType: "NOOP",
    input: {},
    compatibility: "core-v1",
    setup: [
      ["addTodo", TODO_A],
      ["addTodo", TODO_B],
    ],
    // Two undo rows at one index with `skip` increasing, which is what a
    // protocol-v1 stream carries and what the live reducer collects away.
    archived: { skip: 1 },
    archivedAppend: [
      { type: "NOOP", scope: "global", input: {}, index: 2, skip: 2 },
    ],
    expected: {
      outcome: "applied",
      // The chain is accepted and undoes both todos. The rebuild returns
      // before the hash step, so the last row keeps the empty hash it
      // carried.
      state: PARITY_EMPTY,
      hash: "empty",
      errors: NO_ERRORS,
      dispatches: [],
    },
  },
];

const REDO_ROWS: readonly DispatchRow[] = [
  {
    id: "redo/creator",
    caseKey: "redo",
    subject: "parity",
    route: "creator",
    documentVersion: 1,
    scope: "global",
    actionType: "REDO",
    input: { count: 1 },
    compatibility: "core-v1",
    setup: [
      ["addTodo", TODO_A],
      ["undo", 1],
    ],
    creator: "redo",
    creatorArgs: [1],
    options: { protocolVersion: 1 },
    expected: {
      outcome: "applied",
      state: parityWith([TODO_A]),
      hash: "computed",
      errors: NO_ERRORS,
      dispatches: [],
    },
  },
  {
    id: "redo/creator-empty-clipboard",
    caseKey: "redo",
    subject: "parity",
    route: "creator",
    documentVersion: 1,
    scope: "global",
    actionType: "REDO",
    input: { count: 1 },
    compatibility: "core-v1",
    setup: [["addTodo", TODO_A]],
    creator: "redo",
    creatorArgs: [1],
    expected: {
      outcome: "reducer-rejected",
      state: parityWith([TODO_A]),
      hash: "none",
      errors: {
        ...NO_ERRORS,
        reducerRejection: "Cannot redo: no operations in the clipboard",
      },
      dispatches: [],
    },
  },
];

/** Legacy pruning creators are absent from both authoring paths. */
const PRUNE_ROWS: readonly DispatchRow[] = [
  {
    id: "prune/creator-global",
    caseKey: "prune",
    subject: "parity",
    route: "creator",
    documentVersion: 1,
    scope: "global",
    actionType: "PRUNE",
    input: { start: 0, end: 2 },
    compatibility: "core-v1-retained",
    setup: [
      ["addTodo", TODO_A],
      ["addTodo", TODO_B],
    ],
    creator: "prune",
    creatorArgs: [0, 2],
    expected: {
      outcome: "creator-rejected",
      state: parityWith([TODO_A, TODO_B]),
      hash: "none",
      errors: {
        ...NO_ERRORS,
        creatorRejection: "the actions map has no creator prune",
      },
      dispatches: [],
    },
  },
  {
    id: "prune/creator-local",
    caseKey: "prune",
    subject: "parity",
    route: "creator",
    documentVersion: 1,
    scope: "local",
    actionType: "PRUNE",
    input: { start: 0, end: 1 },
    compatibility: "core-v1-retained",
    setup: [
      ["addTodo", TODO_A],
      ["setNote", { note: "n" }],
    ],
    creator: "prune",
    creatorArgs: [0, 1, "local"],
    expected: {
      outcome: "creator-rejected",
      state: parityWith([TODO_A], "n"),
      hash: "none",
      errors: {
        ...NO_ERRORS,
        creatorRejection: "the actions map has no creator prune",
      },
      dispatches: [],
    },
  },
  {
    id: "prune/creator-local-reads-global-history",
    caseKey: "prune",
    subject: "parity",
    route: "creator",
    documentVersion: 1,
    scope: "local",
    actionType: "PRUNE",
    input: { start: 0, end: 1 },
    compatibility: "core-v1-retained",
    setup: [["setNote", { note: "n" }]],
    withoutGlobalHistory: true,
    creator: "prune",
    creatorArgs: [0, 1, "local"],
    expected: {
      outcome: "creator-rejected",
      state: parityWith([], "n"),
      hash: "none",
      errors: {
        ...NO_ERRORS,
        creatorRejection: "the actions map has no creator prune",
      },
      dispatches: [],
    },
  },
];

/**
 * C3.4: a code-first reducer sees the same action, at the same time, as a
 * generated one — the `actionFromAction` projection, carrying the persisted
 * `context` verbatim. No ordinal reaches either reducer: the executor supplies
 * `ordinal: 0` while it evaluates and patches the database ordinal after
 * insertion (`packages/reactor/src/executor/util.ts`,
 * `packages/reactor/src/executor/simple-job-executor.ts`). Completing the
 * context type and reserving an ordinal before reduction are separate runtime
 * changes; this row asserts the placeholder, not executor behavior.
 */
export const ORDINAL_AT_EVALUATION = 0;

const CONTEXT_ROWS: readonly DispatchRow[] = [
  {
    id: "context-and-ordinal/raw-action",
    caseKey: "context-and-ordinal",
    subject: "parity",
    route: "raw-action",
    documentVersion: 1,
    scope: "global",
    actionType: "ADD_TODO",
    input: TODO_A,
    compatibility: "core-v1",
    context: { prevOpIndex: -1, prevOpHash: "", nonce: "matrix-nonce" },
    expected: {
      outcome: "applied",
      state: parityWith([TODO_A]),
      hash: "computed",
      errors: NO_ERRORS,
      dispatches: [],
    },
  },
];

const VERSION_DISPATCH_ROWS: readonly DispatchRow[] = [
  {
    id: "version-selection/raw-action-v1",
    caseKey: "version-selection",
    subject: "task-v1",
    route: "raw-action",
    documentVersion: 1,
    scope: "global",
    actionType: "SET_TITLE",
    input: { title: "from v2" },
    compatibility: "core-v1",
    expected: {
      // v1 declares no SET_TITLE, so its reducer records the operation and
      // matches no case.
      outcome: "applied",
      state: { global: { tasks: [] }, local: {} },
      hash: "computed",
      errors: NO_ERRORS,
      dispatches: [],
    },
  },
  {
    id: "version-selection/raw-action-v2",
    caseKey: "version-selection",
    subject: "task-v2",
    route: "raw-action",
    documentVersion: 2,
    scope: "global",
    actionType: "SET_TITLE",
    input: { title: "from v2" },
    compatibility: "core-v1",
    expected: {
      outcome: "applied",
      state: { global: { title: "from v2", tasks: [] }, local: {} },
      hash: "computed",
      errors: NO_ERRORS,
      dispatches: [],
    },
  },
];

const DEFINITION_ROWS: readonly DefinitionRow[] = [
  {
    id: "stored-version/undefined",
    caseKey: "stored-version",
    subject: "task-v2",
    route: "definition",
    documentVersion: undefined,
    compatibility: "core-v1",
    check: { kind: "stored-version", resolvesTo: 1 },
  },
  {
    id: "stored-version/null",
    caseKey: "stored-version",
    subject: "task-v2",
    route: "definition",
    documentVersion: null,
    compatibility: "core-v1",
    check: { kind: "stored-version", resolvesTo: 1 },
  },
  {
    id: "stored-version/zero",
    caseKey: "stored-version",
    subject: "task-v2",
    route: "definition",
    documentVersion: 0,
    compatibility: "core-v1",
    check: { kind: "stored-version", resolvesTo: 1 },
  },
  {
    id: "version-selection/registry",
    caseKey: "version-selection",
    subject: "task-v2",
    route: "definition",
    documentVersion: 2,
    compatibility: "core-v1",
    check: { kind: "version-selection" },
  },
  {
    id: "upgrade-edge/v1-to-v2",
    caseKey: "upgrade-edge",
    subject: "task-v2",
    route: "definition",
    documentVersion: 2,
    compatibility: "core-v1",
    check: { kind: "upgrade-edges", edges: [2] },
  },
  {
    id: "duplicate-action-type/definition",
    caseKey: "duplicate-action-type",
    subject: "parity",
    route: "definition",
    documentVersion: 1,
    compatibility: "core-v1",
    check: {
      kind: "duplicate-action-type",
      actionType: "ADD_TODO",
      codeFirst: "PH-DM-DUPLICATE-ACTION",
      schemaFirst: "reported",
      sharedChecker: "PH-DM-DUPLICATE-ACTION",
    },
  },
];

export const MATRIX: readonly MatrixRow[] = [
  ...INVALID_INPUT_ROWS,
  ...EXTRA_KEY_ROWS,
  ...WRONG_SCOPE_ROWS,
  ...UNKNOWN_SCOPE_ROWS,
  ...NO_INPUT_ROWS,
  ...UNKNOWN_ACTION_ROWS,
  ...DOMAIN_ERROR_ROWS,
  ...DENIAL_ROWS,
  ...LOAD_ROWS,
  ...UNDO_ROWS,
  ...REDO_ROWS,
  ...PRUNE_ROWS,
  ...CONTEXT_ROWS,
  ...VERSION_DISPATCH_ROWS,
  ...DEFINITION_ROWS,
];

// ─── Coverage ────────────────────────────────────────────────────────────

/**
 * One entry per row of the task-025 table, with the routes that case has to
 * exercise. A passing creator route is not coverage of the raw or archived
 * ones: each reaches validation and dispatch through its own entry point.
 */
export const REQUIRED_ROUTES = {
  "invalid-input": {
    pins: "Invalid input",
    routes: ["creator", "raw-action", "archived-replay"],
  },
  "extra-unknown-keys": {
    pins: "Extra unknown keys",
    routes: ["creator", "raw-action", "archived-replay"],
  },
  "wrong-scope": {
    pins: "Wrong scope (declared vs persisted)",
    routes: ["raw-action", "archived-replay"],
  },
  "unknown-runtime-scope": {
    pins: "Unknown runtime scope string",
    routes: ["raw-action", "archived-replay"],
  },
  "no-input-operation": {
    pins: "No-input operation",
    routes: ["raw-action", "archived-replay"],
  },
  "unknown-action-type": {
    pins: "Unknown action type",
    routes: ["raw-action", "archived-replay"],
  },
  "domain-error-default-message": {
    pins: "Domain error, default message",
    routes: ["creator", "raw-action", "archived-replay"],
  },
  "domain-error-explicit-message": {
    pins: "Domain error, explicit message",
    routes: ["creator"],
  },
  denial: { pins: "Denial", routes: ["archived-replay"] },
  load: { pins: "Load", routes: ["creator", "raw-action"] },
  "duplicate-index-undo": {
    pins: "Duplicate-index undo",
    routes: ["creator", "archived-replay"],
  },
  redo: { pins: "Redo", routes: ["creator"] },
  prune: { pins: "Prune (global and local)", routes: ["creator"] },
  "stored-version": { pins: "Stored version 0 → 1", routes: ["definition"] },
  "context-and-ordinal": {
    pins: "Context and ordinal timing",
    routes: ["raw-action"],
  },
  "version-selection": {
    pins: "Version selection",
    routes: ["definition", "raw-action"],
  },
  "upgrade-edge": { pins: "Every upgrade edge", routes: ["definition"] },
  "duplicate-action-type": {
    pins: "Duplicate action type",
    routes: ["definition"],
  },
} as const satisfies Readonly<
  Record<string, { readonly pins: string; readonly routes: readonly Route[] }>
>;

export type CaseKey = keyof typeof REQUIRED_ROUTES;

/**
 * The cases a GraphQL host has to prove as well.
 *
 * They are declared here, beside the routes they belong to, so a renamed or
 * deleted case breaks the promise rather than quietly dropping it. They are
 * not rows: dispatching them needs a running GraphQL host, which this package
 * deliberately does not depend on, so `packages/reactor-api` executes them.
 */
export const GRAPHQL_CASES: readonly CaseKey[] = [
  "invalid-input",
  "no-input-operation",
  "domain-error-default-message",
  "domain-error-explicit-message",
];

/**
 * The committed row IDs. Deleting a row without deleting its ID here — or
 * deleting an ID without its row — fails the suite.
 */
export const CASE_IDS: readonly string[] = [
  "invalid-input/creator",
  "invalid-input/raw-action",
  "invalid-input/archived-replay",
  "extra-unknown-keys/creator",
  "extra-unknown-keys/raw-action",
  "extra-unknown-keys/archived-replay",
  "wrong-scope/raw-action",
  "wrong-scope/archived-replay",
  "unknown-runtime-scope/raw-action",
  "unknown-runtime-scope/archived-replay",
  "no-input-operation/raw-action",
  "no-input-operation/archived-replay",
  "unknown-action-type/raw-action",
  "unknown-action-type/archived-replay",
  "domain-error-default-message/creator",
  "domain-error-default-message/raw-action",
  "domain-error-default-message/archived-replay",
  "domain-error-explicit-message/creator",
  "denial/archived-replay",
  "load/raw-action",
  "load/creator",
  "duplicate-index-undo/creator",
  "duplicate-index-undo/archived-replay",
  "redo/creator",
  "redo/creator-empty-clipboard",
  "prune/creator-global",
  "prune/creator-local",
  "prune/creator-local-reads-global-history",
  "context-and-ordinal/raw-action",
  "version-selection/raw-action-v1",
  "version-selection/raw-action-v2",
  "stored-version/undefined",
  "stored-version/null",
  "stored-version/zero",
  "version-selection/registry",
  "upgrade-edge/v1-to-v2",
  "duplicate-action-type/definition",
];

/**
 * The rows whose two approaches do not agree today. Every entry is evidence
 * of a real difference, not a tolerance: the runner fails a row that carries
 * a divergence and then agrees anyway.
 */
export const KNOWN_DIVERGENCES: readonly string[] = [];

/**
 * The rows that pin behavior this release keeps on purpose. Their correction
 * is the deferred X-protocol work in `.tasks/README.md`.
 */
export const RETAINED_COMPATIBILITY_IDS: readonly string[] = [
  "wrong-scope/raw-action",
  "wrong-scope/archived-replay",
  "load/creator",
  "prune/creator-global",
  "prune/creator-local",
  "prune/creator-local-reads-global-history",
];
