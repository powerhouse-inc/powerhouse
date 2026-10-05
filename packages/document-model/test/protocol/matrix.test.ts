import type {
  Action,
  DocumentModelPHState,
  DocumentOperations,
  Operation,
  PHBaseState,
  PHDocument,
  Signal,
} from "@powerhousedao/shared/document-model";
import {
  deriveOperationId,
  hashDocumentStateForScope,
  normalizeDocumentModelVersion,
  operationOutcome,
  replayDocument,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { DocumentModelDefinitionError } from "../../src/definition/diagnostics.js";
import { ph } from "../../src/definition/field.js";
import { defineDocumentModel } from "../../src/definition/model.js";
import { deriveSchemaFirstOperationNames } from "../../src/definition/naming.js";
import { adaptSchemaFirstDocumentModelModule } from "../../src/definition/tooling/adapters/schema-first-document-model-module-adapter.js";
import { upgradeTaskToV2 } from "../definition/fixtures/family-model.js";
import { schemaFirstParity } from "../definition/fixtures/parity-model.js";
import type {
  CaseKey,
  DefinitionCheck,
  DefinitionRow,
  DispatchRow,
  ExpectedOutcome,
  MatrixRow,
  Outcome,
  ProtocolModule,
  Route,
  Subject,
} from "./matrix.js";
import {
  CASE_IDS,
  GRAPHQL_CASES,
  KNOWN_DIVERGENCES,
  MATRIX,
  ORDINAL_AT_EVALUATION,
  REQUIRED_ROUTES,
  RETAINED_COMPATIBILITY_IDS,
  SUBJECTS,
  TASK_FAMILY,
} from "./matrix.js";

/** The scopes every document carries, which no model declares. */
const BASE_SCOPES = new Set(["auth", "document"]);

/** The v2 shape `upgradeTaskToV2` produces from a v1 document. */
type UpgradedTaskState = PHBaseState & {
  global: { title: string; tasks: unknown[] };
  local: Record<string, never>;
};

type Approach = "schemaFirst" | "codeFirst";
const APPROACHES: readonly Approach[] = ["schemaFirst", "codeFirst"];

/** The classification is a string so a hash that fits no case is reported. */
type Observation = Omit<ExpectedOutcome, "hash"> & { readonly hash: string };

function isDispatchRow(row: MatrixRow): row is DispatchRow {
  return row.route !== "definition";
}

function modelScopes(state: PHDocument["state"]): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(state).filter(([scope]) => !BASE_SCOPES.has(scope)),
  );
}

function rawAction(row: DispatchRow): Action {
  return {
    id: `matrix-${row.id}`,
    timestampUtcMs: "2026-01-01T00:00:00.000Z",
    type: row.actionType,
    input: row.input,
    scope: row.scope,
    context: row.context,
  };
}

function creatorOf(
  module: ProtocolModule,
  key: string,
): (...args: never[]) => Action {
  const creator = module.actions[key];
  if (creator === undefined) {
    throw new Error(`the actions map has no creator ${key}`);
  }
  return creator;
}

function creatorAction(module: ProtocolModule, row: DispatchRow): Action {
  const args = (row.creatorArgs ?? [row.input]) as never[];
  return creatorOf(module, row.creator ?? "")(...args);
}

/**
 * `DocumentOperations` is typed as a total record, but a stored history need
 * not carry every scope, which is what its own TODO says and what
 * `pruneOperation` guards against.
 */
function scopeOperations(
  operations: DocumentOperations,
  scope: string,
): readonly Operation[] {
  return (operations as Partial<DocumentOperations>)[scope] ?? [];
}

/** The document the row's own action is dispatched against. */
function withSetup(module: ProtocolModule, row: DispatchRow): PHDocument {
  let document = module.utils.createDocument();
  for (const [creator, ...args] of row.setup ?? []) {
    document = module.reducer(
      document,
      creatorOf(module, creator)(...(args as never[])),
      undefined,
      row.options,
    );
  }
  if (row.withoutGlobalHistory !== true) return document;
  const { global: _global, ...operations } = document.operations;
  return { ...document, operations };
}

function archivedOperations(
  operations: DocumentOperations,
  row: DispatchRow,
  documentId: string,
): DocumentOperations {
  const scoped = scopeOperations(operations, row.scope);
  const last = scoped.at(-1);
  if (last === undefined) {
    throw new Error(`${row.id} has no operation to archive`);
  }
  const appended = (row.archivedAppend ?? []).map((spec) => {
    const action: Action = {
      id: `matrix-${row.id}-${spec.index}-${spec.skip}`,
      timestampUtcMs: "2026-01-01T00:00:01.000Z",
      type: spec.type,
      input: spec.input,
      scope: spec.scope,
    };
    return {
      ...action,
      action,
      id: deriveOperationId(documentId, spec.scope, "main", action.id),
      hash: "",
      index: spec.index,
      skip: spec.skip,
    };
  });
  return {
    ...operations,
    [row.scope]: [
      ...scoped.slice(0, -1),
      { ...last, ...row.archived },
      ...appended,
    ],
  };
}

function classifyHash(
  operation: Operation | undefined,
  row: DispatchRow,
  document: PHDocument,
  archived: Operation | undefined,
): string {
  if (operation === undefined) return "none";
  if (operation.hash === "") return "empty";
  if (archived !== undefined && operation.hash === archived.hash) {
    return "carried";
  }
  if (operation.hash === hashDocumentStateForScope(document, row.scope)) {
    return "computed";
  }
  return `unclassified:${operation.hash}`;
}

function classifyOutcome(operation: Operation | undefined): Outcome {
  return operation === undefined ? "applied" : operationOutcome(operation).kind;
}

/**
 * The stored `OperationErrorSpecification.code` of the row's operation, found
 * through the one naming implementation both approaches derive from.
 */
function specificationCode(
  module: ProtocolModule,
  row: DispatchRow,
): string | null {
  const version = normalizeDocumentModelVersion(row.documentVersion);
  const specifications = module.documentModel.global.specifications;
  const specification =
    specifications.find((entry) => entry.version === version) ??
    specifications[0];
  for (const declared of specification.modules) {
    for (const operation of declared.operations) {
      const name = operation.name;
      if (
        name !== null &&
        deriveSchemaFirstOperationNames(name).actionType === row.actionType
      ) {
        return operation.errors[0]?.code ?? null;
      }
    }
  }
  return null;
}

type Run = {
  readonly observation: Observation;
  /** The document the row produced, or the untouched one when it rejected. */
  readonly document: PHDocument;
  readonly action: Action | undefined;
  readonly operation: Operation | undefined;
};

function run(subject: Subject, approach: Approach, row: DispatchRow): Run {
  const module = subject[approach];
  const captured = subject.capturedErrors[approach];
  captured.length = 0;
  const dispatches: string[] = [];
  const dispatch = (signal: Signal) => dispatches.push(signal.type);

  const before = withSetup(module, row);
  const errors = (
    rejection: Partial<ExpectedOutcome["errors"]>,
    operation?: Operation,
  ): ExpectedOutcome["errors"] => ({
    creatorRejection: null,
    reducerRejection: null,
    ...rejection,
    operationError: operation?.error ?? null,
    deniedReason: operation?.deniedReason ?? null,
    errorCode: captured.at(-1)?.errorCode ?? null,
    errorName: captured.at(-1)?.name ?? null,
    specificationCode: specificationCode(module, row),
  });
  const rejected = (
    kind: "creator-rejected" | "reducer-rejected",
    message: string,
    action: Action | undefined,
  ): Run => ({
    observation: {
      outcome: kind,
      state: modelScopes(before.state),
      hash: "none",
      errors: errors(
        kind === "creator-rejected"
          ? { creatorRejection: message }
          : { reducerRejection: message },
      ),
      dispatches,
    },
    document: before,
    action,
    operation: undefined,
  });

  let action: Action;
  try {
    action =
      row.route === "creator" ? creatorAction(module, row) : rawAction(row);
  } catch (error) {
    return rejected("creator-rejected", (error as Error).message, undefined);
  }

  let after: PHDocument;
  let archived: Operation | undefined;
  try {
    if (row.route === "archived-replay") {
      // The archived route rebuilds the document from its initial state and
      // its stored operations, which is how a reactor serves a history. The
      // operations are minted through one dispatch first, so the row replays
      // the bytes the live document would have stored.
      const minted = module.reducer(before, action, undefined, row.options);
      const operations = archivedOperations(
        minted.operations,
        row,
        before.header.id,
      );
      archived = scopeOperations(operations, row.scope).at(-1);
      after = replayDocument(
        before.initialState,
        operations,
        module.reducer,
        before.header,
        dispatch,
      );
    } else {
      after = module.reducer(before, action, dispatch, row.options);
    }
  } catch (error) {
    return rejected("reducer-rejected", (error as Error).message, action);
  }

  const operation = scopeOperations(after.operations, row.scope).at(-1);
  return {
    observation: {
      outcome: classifyOutcome(operation),
      state: modelScopes(after.state),
      hash: classifyHash(operation, row, after, archived),
      errors: errors({}, operation),
      dispatches,
    },
    document: after,
    action,
    operation,
  };
}

function expectationFor(row: DispatchRow, approach: Approach): ExpectedOutcome {
  if (approach === "codeFirst" || row.divergence === undefined) {
    return row.expected;
  }
  return { ...row.expected, ...row.divergence.schemaFirst };
}

const dispatchRows = MATRIX.filter(isDispatchRow);
const definitionRows = MATRIX.filter(
  (row): row is DefinitionRow => row.route === "definition",
);

function operationOf(result: Run): Operation {
  if (result.operation === undefined) {
    throw new Error("the row recorded no operation");
  }
  return result.operation;
}

function dispatchRow(id: string): DispatchRow {
  const row = dispatchRows.find((entry) => entry.id === id);
  if (row === undefined) throw new Error(`the matrix has no row ${id}`);
  return row;
}

function definitionCheck<TKind extends DefinitionCheck["kind"]>(
  kind: TKind,
): Extract<DefinitionCheck, { kind: TKind }> {
  const row = definitionRows.find((entry) => entry.check.kind === kind);
  if (row === undefined) throw new Error(`the matrix has no ${kind} row`);
  return row.check as Extract<DefinitionCheck, { kind: TKind }>;
}

describe("the protocol matrix", () => {
  describe.each(dispatchRows)("$id", (row) => {
    const subject = SUBJECTS[row.subject];

    it.each(APPROACHES)("matches the row for %s", (approach) => {
      expect(run(subject, approach, row).observation).toStrictEqual(
        expectationFor(row, approach),
      );
    });

    it("agrees between the two approaches", () => {
      const schemaFirst = run(subject, "schemaFirst", row).observation;
      const codeFirst = run(subject, "codeFirst", row).observation;
      if (row.divergence === undefined) {
        expect(codeFirst).toStrictEqual(schemaFirst);
      } else {
        // A stale divergence is as wrong as an unrecorded one.
        expect(codeFirst).not.toStrictEqual(schemaFirst);
      }
    });

    it("serves the stored document version the row declares", () => {
      for (const approach of APPROACHES) {
        expect(subject[approach].version).toBe(
          normalizeDocumentModelVersion(row.documentVersion),
        );
      }
    });
  });
});

describe("the matrix and its committed case list", () => {
  it("has one row for every committed case ID", () => {
    expect(MATRIX.map((row) => row.id).sort()).toStrictEqual(
      [...CASE_IDS].sort(),
    );
  });

  it("gives every row a unique ID", () => {
    expect(new Set(MATRIX.map((row) => row.id)).size).toBe(MATRIX.length);
  });

  it("covers every required case and route pair", () => {
    const covered = new Map<CaseKey, Set<Route>>();
    for (const row of MATRIX) {
      const routes = covered.get(row.caseKey) ?? new Set<Route>();
      routes.add(row.route);
      covered.set(row.caseKey, routes);
    }
    const missing = Object.entries(REQUIRED_ROUTES).flatMap(
      ([caseKey, required]) =>
        required.routes
          .filter(
            (route) => covered.get(caseKey as CaseKey)?.has(route) !== true,
          )
          .map((route) => `${caseKey}/${route}`),
    );
    expect(missing).toStrictEqual([]);
    expect([...covered.keys()].sort()).toStrictEqual(
      Object.keys(REQUIRED_ROUTES).sort(),
    );
  });

  it("names only real cases as owed to a GraphQL host", () => {
    // The rows themselves live where a host can run them; what is pinned here
    // is which cases owe that proof, so renaming one breaks the promise.
    expect(
      GRAPHQL_CASES.filter((caseKey) => !(caseKey in REQUIRED_ROUTES)),
    ).toStrictEqual([]);
    expect([...GRAPHQL_CASES].sort()).toStrictEqual([
      "domain-error-default-message",
      "domain-error-explicit-message",
      "invalid-input",
      "no-input-operation",
    ]);
  });

  it("lists exactly the rows whose approaches disagree", () => {
    const carried = MATRIX.filter(
      (row) =>
        (isDispatchRow(row) && row.divergence !== undefined) ||
        (!isDispatchRow(row) && row.divergenceReason !== undefined),
    ).map((row) => row.id);
    expect(carried.sort()).toStrictEqual([...KNOWN_DIVERGENCES].sort());
  });

  it("lists exactly the rows that pin retained compatibility", () => {
    const retained = MATRIX.filter(
      (row) => row.compatibility === "core-v1-retained",
    ).map((row) => row.id);
    expect(retained.sort()).toStrictEqual(
      [...RETAINED_COMPATIBILITY_IDS].sort(),
    );
  });
});

/**
 * The row-level assertions above compare one observation record. These pin
 * the claims that record cannot carry: object identity, history shape, and
 * the absence of a creator.
 */
describe("what the observation record cannot carry", () => {
  const parity = SUBJECTS.parity;

  const indexAndSkip = (operations: readonly Operation[]) =>
    operations.map((operation) => [operation.index, operation.skip]);

  it("reaches the authored reducer with every nested unknown key intact", () => {
    const row = dispatchRow("extra-unknown-keys/creator");
    for (const approach of APPROACHES) {
      const persisted = operationOf(run(parity, approach, row)).action
        .input as { meta: { depth1: { depth2: { depth3: string } } } };
      expect(persisted.meta.depth1.depth2.depth3).toBe("kept");
      // The creator clones one level, so the nested object is the caller's.
      expect(persisted.meta).toBe((row.input as { meta: unknown }).meta);
    }
  });

  it("has no creator that produces an action without an input", () => {
    // The one operation with an empty input still emits an input object, so
    // only a raw or archived action can carry none at all.
    for (const approach of APPROACHES) {
      expect(creatorOf(parity[approach], "clear")().input).toStrictEqual({});
    }
  });

  it("reuses one index with an increasing skip across consecutive undos", () => {
    const row = dispatchRow("duplicate-index-undo/creator");
    for (const approach of APPROACHES) {
      const module = parity[approach];
      // The setup ends with the first undo, so the two snapshots are the two
      // consecutive undo rows: one index, an increasing skip.
      const before = withSetup(module, row);
      const after = run(parity, approach, row).document;
      expect(
        indexAndSkip(scopeOperations(before.operations, "global")),
      ).toStrictEqual([
        [0, 0],
        [2, 1],
      ]);
      expect(
        indexAndSkip(scopeOperations(after.operations, "global")),
      ).toStrictEqual([[2, 2]]);
    }
  });

  it("replays a stream that reuses an index with an increasing skip", () => {
    const row = dispatchRow("duplicate-index-undo/archived-replay");
    for (const approach of APPROACHES) {
      const history = scopeOperations(
        run(parity, approach, row).document.operations,
        "global",
      );
      expect(indexAndSkip(history)).toStrictEqual([
        [0, 0],
        [1, 0],
        [2, 1],
        [2, 2],
      ]);
    }
  });

  it("hands the reducer the persisted action context and no ordinal", () => {
    const row = dispatchRow("context-and-ordinal/raw-action");
    for (const approach of APPROACHES) {
      const result = run(parity, approach, row);
      const operation = operationOf(result);
      expect(Object.keys(operation.action)).toStrictEqual([
        "id",
        "timestampUtcMs",
        "type",
        "input",
        "scope",
        "context",
      ]);
      expect(operation.action.context).toStrictEqual(row.context);
      // The executor supplies the ordinal after insertion, so nothing the
      // reducer produced carries one.
      expect(
        (operation as { readonly ordinal?: number }).ordinal ??
          ORDINAL_AT_EVALUATION,
      ).toBe(ORDINAL_AT_EVALUATION);
      expect(operation.id).toBe(
        deriveOperationId(
          result.document.header.id,
          row.scope,
          "main",
          operation.action.id,
        ),
      );
    }
  });

  it("keeps the declared scope on the creator while the reducer follows the persisted one", () => {
    // The other half of `wrong-scope/*`: the creator never emits the wrong
    // scope, so only a raw or archived action can carry one. Strict rejection
    // is deferred to X-protocol.
    for (const approach of APPROACHES) {
      expect(
        creatorOf(parity[approach], "setNote")({ note: "x" } as never).scope,
      ).toBe("local");
    }
  });
});

describe("definition rows", () => {
  it("resolves stored versions undefined, null, and 0 to version 1", () => {
    const rows = definitionRows.filter(
      (row) => row.check.kind === "stored-version",
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      const check = row.check as Extract<
        DefinitionCheck,
        { kind: "stored-version" }
      >;
      const stored = row.documentVersion;
      expect(normalizeDocumentModelVersion(stored)).toBe(check.resolvesTo);
      for (const approach of APPROACHES) {
        const [v1, v2] = TASK_FAMILY[approach].modules;
        const v1State = v1.utils.createState();
        const stamped = {
          ...v1State,
          document: { ...v1State.document, version: stored },
        };
        // v2 requires `title`; it accepts this state only by resolving the
        // stamp to 1 and validating against the v1 schema.
        expect(v2.utils.isStateOfType(stamped as never)).toBe(true);
      }
    }
  });

  it("selects the module and the schema the stored version names", () => {
    for (const approach of APPROACHES) {
      const [v1, v2] = TASK_FAMILY[approach].modules;
      expect([v1.version, v2.version]).toStrictEqual([1, 2]);
      expect(Object.keys(v1.actions)).not.toContain("setTitle");
      expect(Object.keys(v2.actions)).toContain("setTitle");
      const v1State = v1.utils.createState();
      expect(v2.utils.isStateOfType(v1State as never)).toBe(true);
      const stampedV2 = {
        ...v1State,
        document: { ...v1State.document, version: 2 },
      };
      // A v1 module knows no v2 schema, so it falls back to its own.
      expect(v1.utils.isStateOfType(stampedV2 as never)).toBe(true);
      expect(v2.utils.isStateOfType(stampedV2 as never)).toBe(false);
    }
  });

  it("rewrites both state and initialState on every upgrade edge", () => {
    const check = definitionCheck("upgrade-edges");
    for (const approach of APPROACHES) {
      const { upgradeManifest } = TASK_FAMILY[approach];
      const v1 = SUBJECTS["task-v1"][approach];
      expect(upgradeManifest.supportedVersions).toStrictEqual([1, 2]);
      expect(Object.keys(upgradeManifest.upgrades)).toStrictEqual(
        check.edges.map((edge) => `v${edge}`),
      );
      for (const edge of check.edges) {
        const transition = upgradeManifest.upgrades[`v${edge}`];
        expect(transition.toVersion).toBe(edge);
        expect(transition.upgradeReducer).toBe(upgradeTaskToV2.upgradeReducer);
        const addTask = creatorOf(v1, "addTask");
        const before = v1.reducer(
          v1.utils.createDocument(),
          addTask({ id: "one" } as never),
        );
        const upgraded = transition.upgradeReducer(
          before,
          addTask({ id: "ignored" } as never),
        ) as PHDocument<UpgradedTaskState>;
        expect(upgraded.state.global).toStrictEqual({
          title: "",
          tasks: [{ id: "one", completed: false }],
        });
        expect(upgraded.initialState.global).toStrictEqual({
          title: "",
          tasks: [],
        });
      }
    }
  });

  /**
   * A model that cannot finalize has no history to replay, so this is a
   * definition-time route with no dispatch. The code-first compiler rejects
   * the complete model. The schema-first adapter does not yet run the shared
   * collision checker, which is the divergence the row records.
   */
  it("rejects one action type derived by two modules", () => {
    const check = definitionCheck("duplicate-action-type");

    const model = defineDocumentModel({
      id: "test/protocol-duplicate",
      name: "Duplicate",
      description: "",
      extension: "dup",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        global: {
          schema: ph.object("DuplicateState", {
            fields: { title: ph.String({ required: true }) },
          }),
          initialValue: { title: "" },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const first = model.module("first", {
      operations: ({ global }) => ({
        addTodo: global({
          input: ph.input({ fields: { id: ph.String({ required: true }) } }),
          reduce() {},
        }),
      }),
    });
    const second = model.module("second", {
      operations: ({ global }) => ({
        addTodo: global({
          input: ph.input({ fields: { id: ph.String({ required: true }) } }),
          reduce() {},
        }),
      }),
    });
    let codeFirstDiagnostics: readonly { readonly code: string }[] = [];
    try {
      model.finalize({ modules: [first, second] });
    } catch (error) {
      if (!(error instanceof DocumentModelDefinitionError)) throw error;
      codeFirstDiagnostics = error.diagnostics;
    }
    // Both operations also derive one GraphQL input type name, so the
    // collision is reported once per claim it breaks.
    expect(
      codeFirstDiagnostics.map((diagnostic) => diagnostic.code),
    ).toStrictEqual(["PH-DM-DUPLICATE-NAME", check.codeFirst]);

    const stored = structuredClone(
      schemaFirstParity.documentModel,
    ) as DocumentModelPHState;
    const specification = stored.global.specifications[0];
    specification.modules.push({
      id: "module-twin",
      name: "twin",
      description: "",
      operations: [
        {
          ...specification.modules[0].operations[0],
          id: "operation-add-todo-twin",
        },
      ],
    });
    const adapted = adaptSchemaFirstDocumentModelModule(stored, {
      specifier: "./matrix.js",
    });
    const reported = adapted.diagnostics.filter(
      (diagnostic) => diagnostic.code === check.sharedChecker,
    );
    expect(reported.length === 0 ? "not-reported" : "reported").toBe(
      check.schemaFirst,
    );
    // Neither adapter normalizes a model it would dispatch differently, so
    // the stored state produces no artifact at all.
    expect(adapted.artifacts).toStrictEqual([]);
    expect(reported[0].path.join(".")).toContain("modules.twin");
  });
});
