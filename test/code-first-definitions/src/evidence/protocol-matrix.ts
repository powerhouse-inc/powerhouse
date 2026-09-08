import {
  applyUpgradeDocumentAction,
  computeUpgradeTransitions,
  hashDocumentStateForScope,
  normalizeDocumentModelVersion,
  replayDocument,
  type Action,
  type DocumentModelModule,
  type JsonValue,
  type Operation,
  type PHDocument,
  type Signal,
  type UpgradeManifest,
} from "document-model";
import { readFile } from "node:fs/promises";
import {
  CodeFirstProtocolFamily,
  LegacyProtocolFamily,
  probeProtocolDefinitionDiagnostics,
  readProtocolRuntimeProbe,
  resetProtocolRuntimeProbe,
  storedProtocolErrorCode,
  type ProtocolImplementation,
} from "../../fixtures/protocol/v1/family.js";
import {
  canonicalJson,
  cloneJsonValue,
  compareCodeUnits,
  firstDifference,
  sha256,
} from "./utils.js";

export const PROTOCOL_ROUTES = [
  "creator",
  "raw-action",
  "archived-replay",
  "base-action",
  "family-resolution",
  "upgrade",
  "definition",
  "operation-context",
] as const;

export type ProtocolRoute = (typeof PROTOCOL_ROUTES)[number];

export type ProtocolMatrixRowTemplate = {
  readonly rowId: string;
  readonly route: ProtocolRoute;
  readonly version: number;
  readonly scope: string;
  readonly rawInput: JsonValue;
  readonly compatibilityMode: "core-v1" | "family-v1-v2";
};

export type ProtocolExpectedResult = {
  readonly outcomeCode: string;
  readonly state: JsonValue;
  readonly hashDelta: JsonValue;
  readonly errors: readonly string[];
  readonly dispatches: readonly JsonValue[];
  readonly errorCode: string | null;
  readonly storedErrorCode: string | null;
  readonly selectedModuleVersion: number;
  readonly upgradePath: readonly number[];
};

export type ProtocolMatrixCase = ProtocolMatrixRowTemplate & {
  readonly expected: ProtocolExpectedResult;
};

export type ProtocolMatrixManifest = {
  readonly kind: "powerhouse.gate-fixture-manifest";
  readonly formatVersion: 1;
  readonly gate: "B3";
  readonly fixtureVersion: string;
  readonly requiredTools: Readonly<Record<string, string>>;
  readonly schemaDigest: `sha256:${string}`;
  readonly directDependencies: readonly {
    readonly gate: "B1" | "B9";
    readonly contractRevision: `sha256:${string}`;
    readonly fixtureManifestDigest: `sha256:${string}`;
  }[];
  readonly caseCount: number;
  readonly cases: readonly ProtocolMatrixCase[];
};

export type ProtocolMatrixResultRow = {
  readonly rowId: string;
  readonly route: ProtocolRoute;
  readonly version: number;
  readonly scope: string;
  readonly outcomeCode: string;
  readonly stateDigest: `sha256:${string}`;
  readonly hashDigest: `sha256:${string}`;
  readonly errorCode: string | null;
  readonly dispatchDigest: `sha256:${string}`;
  readonly selectedModuleVersion: number;
  readonly upgradePath: readonly number[];
  readonly firstMismatch: string | null;
};

export type ProtocolMatrixAssertion = {
  readonly id:
    | "B3.validation"
    | "B3.scope"
    | "B3.state"
    | "B3.hash"
    | "B3.error"
    | "B3.dispatch"
    | "B3.version"
    | "B3.upgrade";
  readonly outcome: "pass" | "fail";
  readonly failures: readonly string[];
};

export type ProtocolMatrixEvaluation = {
  readonly matrixDigest: `sha256:${string}`;
  readonly rows: readonly ProtocolMatrixResultRow[];
  readonly assertions: readonly ProtocolMatrixAssertion[];
};

export const PROTOCOL_MATRIX_ROWS: readonly ProtocolMatrixRowTemplate[] = [
  {
    rowId: "creator-valid",
    route: "creator",
    version: 1,
    scope: "global",
    rawInput: { operation: "increment", input: { amount: 2, tag: "creator" } },
    compatibilityMode: "core-v1",
  },
  {
    rowId: "creator-invalid",
    route: "creator",
    version: 1,
    scope: "global",
    rawInput: {
      operation: "increment",
      input: { amount: "not-an-integer", tag: "invalid" },
    },
    compatibilityMode: "core-v1",
  },
  {
    rowId: "raw-invalid",
    route: "raw-action",
    version: 1,
    scope: "global",
    rawInput: { type: "INCREMENT", input: { amount: "invalid" } },
    compatibilityMode: "core-v1",
  },
  {
    rowId: "extra-keys-preserved",
    route: "raw-action",
    version: 1,
    scope: "global",
    rawInput: {
      type: "INCREMENT",
      input: { amount: 1, tag: "extra", extra: "preserved" },
    },
    compatibilityMode: "core-v1",
  },
  {
    rowId: "wrong-scope-core-v1",
    route: "raw-action",
    version: 1,
    scope: "local",
    rawInput: { type: "INCREMENT", input: { amount: 3, tag: "wrong-scope" } },
    compatibilityMode: "core-v1",
  },
  {
    rowId: "unknown-runtime-scope",
    route: "raw-action",
    version: 1,
    scope: "experimental",
    rawInput: { type: "INCREMENT", input: { amount: 1, tag: "unknown" } },
    compatibilityMode: "core-v1",
  },
  {
    rowId: "no-input-creator-absent",
    route: "definition",
    version: 1,
    scope: "global",
    rawInput: { creator: "noInput" },
    compatibilityMode: "core-v1",
  },
  {
    rowId: "no-input-declaration-rejected",
    route: "definition",
    version: 1,
    scope: "global",
    rawInput: { input: null },
    compatibilityMode: "core-v1",
  },
  {
    rowId: "unknown-action",
    route: "raw-action",
    version: 1,
    scope: "global",
    rawInput: { type: "UNKNOWN_ACTION", input: { untouched: true } },
    compatibilityMode: "core-v1",
  },
  {
    rowId: "domain-error-default",
    route: "raw-action",
    version: 1,
    scope: "global",
    rawInput: { type: "FAIL", input: { explicit: false } },
    compatibilityMode: "core-v1",
  },
  {
    rowId: "domain-error-explicit",
    route: "raw-action",
    version: 1,
    scope: "global",
    rawInput: { type: "FAIL", input: { explicit: true } },
    compatibilityMode: "core-v1",
  },
  {
    rowId: "dispatch-signal",
    route: "raw-action",
    version: 1,
    scope: "global",
    rawInput: { type: "EMIT", input: { id: "child-1" } },
    compatibilityMode: "core-v1",
  },
  {
    rowId: "denied-operation-replay",
    route: "archived-replay",
    version: 1,
    scope: "global",
    rawInput: { amount: 5, deniedReason: "fixture-policy-denied" },
    compatibilityMode: "core-v1",
  },
  {
    rowId: "load-state",
    route: "base-action",
    version: 1,
    scope: "global",
    rawInput: { counter: 7, draft: "loaded", name: "Loaded Protocol" },
    compatibilityMode: "core-v1",
  },
  {
    rowId: "duplicate-index-undo",
    route: "base-action",
    version: 1,
    scope: "global",
    rawInput: { amounts: [1, 2], undoCount: 2 },
    compatibilityMode: "core-v1",
  },
  {
    rowId: "redo",
    route: "base-action",
    version: 1,
    scope: "global",
    rawInput: { amounts: [1, 2], undoCount: 1, redoCount: 1 },
    compatibilityMode: "core-v1",
  },
  {
    rowId: "prune-local",
    route: "base-action",
    version: 1,
    scope: "local",
    rawInput: { start: 0, end: 1 },
    compatibilityMode: "core-v1",
  },
  {
    rowId: "prune-global",
    route: "base-action",
    version: 1,
    scope: "global",
    rawInput: { start: 0, end: 1 },
    compatibilityMode: "core-v1",
  },
  {
    rowId: "stored-version-zero",
    route: "family-resolution",
    version: 0,
    scope: "document",
    rawInput: { storedVersion: 0 },
    compatibilityMode: "family-v1-v2",
  },
  {
    rowId: "context-ordinal-timing",
    route: "operation-context",
    version: 1,
    scope: "global",
    rawInput: {
      evaluationOrdinal: 0,
      committedOrdinal: 17,
      marker: "context",
      prevOpIndex: 0,
    },
    compatibilityMode: "core-v1",
  },
  {
    rowId: "version-selection-v2",
    route: "family-resolution",
    version: 2,
    scope: "document",
    rawInput: { storedVersion: 2 },
    compatibilityMode: "family-v1-v2",
  },
  {
    rowId: "upgrade-v1-v2",
    route: "upgrade",
    version: 1,
    scope: "document",
    rawInput: { fromVersion: 1, toVersion: 2, amountBeforeUpgrade: 4 },
    compatibilityMode: "family-v1-v2",
  },
  {
    rowId: "duplicate-action-type-rejects-complete-model",
    route: "definition",
    version: 1,
    scope: "global",
    rawInput: { derivedActionType: "SAME_ACTION" },
    compatibilityMode: "core-v1",
  },
];

export const canonicalProtocolJson: (value: JsonValue) => string =
  canonicalJson;

type ProtocolFamily = {
  readonly modules: readonly DocumentModelModule[];
  readonly upgradeManifest: UpgradeManifest<readonly number[]>;
};

function familyFor(implementation: ProtocolImplementation): ProtocolFamily {
  return (implementation === "legacy"
    ? LegacyProtocolFamily
    : CodeFirstProtocolFamily) as unknown as ProtocolFamily;
}

function moduleAt(
  implementation: ProtocolImplementation,
  version: number,
): DocumentModelModule {
  const module = familyFor(implementation).modules.find(
    (candidate) => normalizeDocumentModelVersion(candidate.version) === version,
  );
  if (!module) throw new RangeError(`No ${implementation} module v${version}.`);
  return module;
}

function moduleForStoredVersion(
  implementation: ProtocolImplementation,
  storedVersion: number | null | undefined,
): DocumentModelModule {
  return moduleAt(implementation, normalizeDocumentModelVersion(storedVersion));
}

function fixtureDocument(module: DocumentModelModule): PHDocument {
  const created = module.utils.createDocument() as PHDocument;
  const state = cloneJsonValue(created.state) as PHDocument["state"];
  return {
    ...created,
    header: {
      ...created.header,
      id: "protocol-document",
      slug: "protocol-document",
      name: "Protocol Document",
      branch: "main",
      createdAtUtcIso: "2025-01-01T00:00:00.000Z",
      lastModifiedAtUtcIso: "2025-01-01T00:00:00.000Z",
      revision: { global: 0, local: 0, document: 0 },
      protocolVersions: { "base-reducer": 1 },
    },
    state,
    initialState: cloneJsonValue(state) as PHDocument["initialState"],
    operations: { global: [], local: [], document: [] },
    clipboard: [],
  };
}

function rawAction(request: {
  readonly id: string;
  readonly type: string;
  readonly input: unknown;
  readonly scope: string;
  readonly context?: Action["context"];
}): Action {
  return {
    id: request.id,
    type: request.type,
    input: request.input,
    scope: request.scope,
    timestampUtcMs: `2025-01-01T00:00:${request.id.replace(/\D/g, "").padStart(2, "0") || "00"}.000Z`,
    ...(request.context ? { context: request.context } : {}),
  };
}

function projectedOperation(operation: Operation): JsonValue {
  return cloneJsonValue({
    type: operation.action.type,
    scope: operation.action.scope,
    input: operation.action.input,
    context: operation.action.context ?? null,
    index: operation.index,
    skip: operation.skip,
    hash: operation.hash,
    error: operation.error ?? null,
    deniedReason: operation.deniedReason ?? null,
  });
}

function projectedDocument(document: PHDocument): JsonValue {
  const state = document.state as unknown as Record<string, unknown>;
  const scopeState = Object.fromEntries(
    Object.entries(state)
      .filter(([scope]) => scope !== "auth" && scope !== "document")
      .sort(([left], [right]) => compareCodeUnits(left, right)),
  );
  const operations = Object.fromEntries(
    Object.entries(document.operations)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([scope, entries]) => [scope, entries.map(projectedOperation)]),
  );
  return cloneJsonValue({
    state: {
      document: {
        version: document.state.document.version,
        isDeleted: document.state.document.isDeleted ?? null,
      },
      scopes: scopeState,
    },
    revision: document.header.revision,
    operations,
    clipboard: document.clipboard.map(projectedOperation),
  });
}

function scopeHashes(document: PHDocument): JsonValue {
  const scopes = new Set([
    "global",
    "local",
    "document",
    ...Object.keys(document.operations),
    ...Object.keys(document.state),
  ]);
  scopes.delete("auth");
  return Object.fromEntries(
    [...scopes]
      .sort(compareCodeUnits)
      .map((scope) => [scope, hashDocumentStateForScope(document, scope)]),
  );
}

function operationErrors(document: PHDocument): string[] {
  const errors: string[] = [];
  for (const [scope, operations] of Object.entries(document.operations).sort(
    ([left], [right]) => compareCodeUnits(left, right),
  )) {
    for (const operation of operations) {
      if (operation.error !== undefined) {
        errors.push(`error:${scope}:${operation.index}:${operation.error}`);
      }
      if (operation.deniedReason !== undefined) {
        errors.push(
          `denied:${scope}:${operation.index}:${operation.deniedReason}`,
        );
      }
    }
  }
  return errors;
}

function caughtError(error: unknown): string {
  if (
    error !== null &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray(error.issues)
  ) {
    return `${error instanceof Error ? error.name : "Error"}:${error.issues
      .map((issue) => {
        const typed = issue as {
          readonly code?: unknown;
          readonly path?: readonly PropertyKey[];
          readonly message?: unknown;
        };
        return `${String(typed.code)}@${(typed.path ?? []).map(String).join(".")}:${String(typed.message)}`;
      })
      .join("|")}`;
  }
  return error instanceof Error
    ? `${error.name}:${error.message}`
    : `Thrown:${String(error)}`;
}

function outcomeFromDocument(document: PHDocument): string {
  const operations = Object.values(document.operations).flat();
  const latest = operations.at(-1);
  if (latest?.deniedReason !== undefined) return "denied";
  if (latest?.error !== undefined) return "reducer-error";
  return "applied";
}

function resultWithoutDocument(request: {
  readonly outcomeCode: string;
  readonly state: JsonValue;
  readonly errors?: readonly string[];
  readonly selectedModuleVersion?: number;
  readonly upgradePath?: readonly number[];
}): ProtocolExpectedResult {
  return {
    outcomeCode: request.outcomeCode,
    state: request.state,
    hashDelta: { before: {}, after: {} },
    errors: request.errors ?? [],
    dispatches: [],
    errorCode: null,
    storedErrorCode: null,
    selectedModuleVersion: request.selectedModuleVersion ?? 1,
    upgradePath: request.upgradePath ?? [],
  };
}

function finishDocument(request: {
  readonly before: PHDocument;
  readonly after: PHDocument;
  readonly dispatches?: readonly Signal[];
  readonly implementation: ProtocolImplementation;
  readonly outcomeCode?: string;
  readonly caught?: readonly string[];
  readonly storedErrorCode?: string | null;
  readonly selectedModuleVersion: number;
  readonly upgradePath?: readonly number[];
  readonly extraState?: JsonValue;
}): ProtocolExpectedResult {
  const probe = readProtocolRuntimeProbe(request.implementation);
  const runtimeErrors = probe.errorCodes.map((code) => `runtime-code:${code}`);
  const storedErrors =
    request.storedErrorCode === undefined || request.storedErrorCode === null
      ? []
      : [`stored-code:${request.storedErrorCode}`];
  return {
    outcomeCode: request.outcomeCode ?? outcomeFromDocument(request.after),
    state:
      request.extraState === undefined
        ? projectedDocument(request.after)
        : cloneJsonValue({
            document: projectedDocument(request.after),
            protocol: request.extraState,
          }),
    hashDelta: {
      before: scopeHashes(request.before),
      after: scopeHashes(request.after),
    },
    errors: [
      ...(request.caught ?? []),
      ...operationErrors(request.after),
      ...runtimeErrors,
      ...storedErrors,
    ],
    dispatches: cloneJsonValue(
      request.dispatches ?? [],
    ) as readonly JsonValue[],
    errorCode: probe.errorCodes.at(-1) ?? null,
    storedErrorCode: request.storedErrorCode ?? null,
    selectedModuleVersion: request.selectedModuleVersion,
    upgradePath: request.upgradePath ?? [],
  };
}

function inputObject(row: ProtocolMatrixRowTemplate): Record<string, unknown> {
  return row.rawInput as Record<string, unknown>;
}

function reduce(
  module: DocumentModelModule,
  document: PHDocument,
  action: Action,
  dispatches: Signal[] = [],
): PHDocument {
  return module.reducer(document, action, (signal) => dispatches.push(signal), {
    protocolVersion: 1,
  }) as PHDocument;
}

function applyIncrements(
  module: DocumentModelModule,
  document: PHDocument,
  amounts: readonly number[],
): PHDocument {
  return amounts.reduce(
    (current, amount, index) =>
      reduce(
        module,
        current,
        rawAction({
          id: `setup-${index + 1}`,
          type: "INCREMENT",
          input: { amount, tag: `setup-${index + 1}` },
          scope: "global",
        }),
      ),
    document,
  );
}

export function executeProtocolMatrixRow(
  implementation: ProtocolImplementation,
  row: ProtocolMatrixRowTemplate,
): ProtocolExpectedResult {
  resetProtocolRuntimeProbe(implementation);
  const input = inputObject(row);

  if (row.rowId === "stored-version-zero") {
    const selected = moduleForStoredVersion(
      implementation,
      input.storedVersion as number,
    );
    return resultWithoutDocument({
      outcomeCode: "selected",
      state: {
        storedVersion: input.storedVersion as number,
        normalizedVersion: normalizeDocumentModelVersion(
          input.storedVersion as number,
        ),
      },
      selectedModuleVersion: normalizeDocumentModelVersion(selected.version),
    });
  }

  if (row.rowId === "version-selection-v2") {
    const selected = moduleForStoredVersion(
      implementation,
      input.storedVersion as number,
    );
    return resultWithoutDocument({
      outcomeCode: "selected",
      state: {
        storedVersion: input.storedVersion as number,
        normalizedVersion: normalizeDocumentModelVersion(
          input.storedVersion as number,
        ),
      },
      selectedModuleVersion: normalizeDocumentModelVersion(selected.version),
    });
  }

  if (row.rowId === "no-input-creator-absent") {
    const module = moduleAt(implementation, 1);
    const creator = String(input.creator);
    return resultWithoutDocument({
      outcomeCode: "absent",
      state: {
        creator,
        present: typeof module.actions[creator] === "function",
      },
    });
  }

  if (row.rowId === "no-input-declaration-rejected") {
    const diagnostics = probeProtocolDefinitionDiagnostics();
    return resultWithoutDocument({
      outcomeCode: "definition-rejected",
      state: diagnostics.noInput as unknown as JsonValue,
      errors: [diagnostics.noInput.codeFirst],
    });
  }

  if (row.rowId === "duplicate-action-type-rejects-complete-model") {
    const diagnostics = probeProtocolDefinitionDiagnostics();
    return resultWithoutDocument({
      outcomeCode: "definition-rejected",
      state: diagnostics.duplicateAction as unknown as JsonValue,
      errors: [
        `legacy:${diagnostics.duplicateAction.legacy}`,
        `code-first:${diagnostics.duplicateAction.codeFirst}`,
      ],
    });
  }

  const module = moduleAt(implementation, row.version);
  const before = fixtureDocument(module);

  if (row.rowId === "creator-valid" || row.rowId === "creator-invalid") {
    const operation = String(input.operation);
    const creator = module.actions[operation];
    if (!creator) {
      return resultWithoutDocument({
        outcomeCode: "missing-creator",
        state: { operation },
        errors: [`missing creator ${operation}`],
      });
    }
    try {
      const action = creator(input.input) as Action;
      const after = reduce(module, before, action);
      return finishDocument({
        before,
        after,
        implementation,
        selectedModuleVersion: row.version,
        extraState: { creatorScope: action.scope },
      });
    } catch (error) {
      return finishDocument({
        before,
        after: before,
        implementation,
        outcomeCode: "creator-rejected",
        caught: [caughtError(error)],
        selectedModuleVersion: row.version,
      });
    }
  }

  if (
    [
      "raw-invalid",
      "extra-keys-preserved",
      "wrong-scope-core-v1",
      "unknown-runtime-scope",
      "unknown-action",
      "domain-error-default",
      "domain-error-explicit",
      "dispatch-signal",
    ].includes(row.rowId)
  ) {
    const dispatches: Signal[] = [];
    const after = reduce(
      module,
      before,
      rawAction({
        id: "action-1",
        type: String(input.type),
        input: input.input,
        scope: row.scope,
      }),
      dispatches,
    );
    const isDomainError = row.rowId.startsWith("domain-error-");
    return finishDocument({
      before,
      after,
      dispatches,
      implementation,
      selectedModuleVersion: row.version,
      ...(isDomainError
        ? { storedErrorCode: storedProtocolErrorCode(module) }
        : {}),
    });
  }

  if (row.rowId === "denied-operation-replay") {
    const applied = reduce(
      module,
      before,
      rawAction({
        id: "action-1",
        type: "INCREMENT",
        input: { amount: input.amount, tag: "denied" },
        scope: row.scope,
      }),
    );
    const generated = applied.operations[row.scope]?.[0];
    if (!generated)
      throw new Error("Denied fixture did not create an operation.");
    const denied: Operation = {
      ...generated,
      hash: "",
      error: undefined,
      deniedReason: String(input.deniedReason),
    };
    const after = replayDocument(
      before.initialState,
      { global: [denied], local: [], document: [] },
      module.reducer,
      before.header,
      undefined,
      {},
      { checkHashes: true },
    ) as PHDocument;
    return finishDocument({
      before,
      after,
      implementation,
      outcomeCode: "denied",
      selectedModuleVersion: row.version,
    });
  }

  if (row.rowId === "load-state") {
    const loaded = module.utils.createState({
      global: { counter: input.counter, events: ["loaded"] },
      local: {
        counter: 0,
        draft: input.draft,
        events: ["loaded-local"],
      },
    } as never);
    const action = module.actions.loadState(
      { name: String(input.name), data: loaded } as never,
      0,
    ) as Action;
    const after = reduce(module, before, action);
    return finishDocument({
      before,
      after,
      implementation,
      selectedModuleVersion: row.version,
    });
  }

  if (row.rowId === "duplicate-index-undo") {
    let after = applyIncrements(module, before, input.amounts as number[]);
    after = reduce(module, after, module.actions.undo(1, row.scope) as Action);
    after = reduce(module, after, module.actions.undo(1, row.scope) as Action);
    return finishDocument({
      before,
      after,
      implementation,
      selectedModuleVersion: row.version,
    });
  }

  if (row.rowId === "redo") {
    let after = applyIncrements(module, before, input.amounts as number[]);
    after = reduce(module, after, module.actions.undo(1, row.scope) as Action);
    after = reduce(module, after, module.actions.redo(1, row.scope) as Action);
    return finishDocument({
      before,
      after,
      implementation,
      selectedModuleVersion: row.version,
    });
  }

  if (row.rowId === "prune-global" || row.rowId === "prune-local") {
    let after = applyIncrements(module, before, [1, 2]);
    after = reduce(
      module,
      after,
      rawAction({
        id: "setup-3",
        type: "SET_DRAFT",
        input: { draft: "before-prune" },
        scope: "local",
      }),
    );
    const beforePrune = after;
    let caught: string[] = [];
    try {
      after = reduce(
        module,
        after,
        module.actions.prune(
          input.start as number,
          input.end as number,
          row.scope,
        ) as Action,
      );
    } catch (error) {
      after = beforePrune;
      caught = [caughtError(error)];
    }
    return finishDocument({
      before,
      after,
      implementation,
      ...(caught.length ? { outcomeCode: "base-action-rejected", caught } : {}),
      selectedModuleVersion: row.version,
    });
  }

  if (row.rowId === "context-ordinal-timing") {
    const action = rawAction({
      id: "action-1",
      type: "OBSERVE_CONTEXT",
      input: {
        evaluationOrdinal: input.evaluationOrdinal,
        marker: input.marker,
      },
      scope: row.scope,
      context: { prevOpIndex: input.prevOpIndex as number },
    });
    const after = reduce(module, before, action);
    const operation = after.operations[row.scope]?.at(-1);
    if (!operation) throw new Error("Context fixture has no operation.");
    const operationWithContext = {
      operation,
      context: {
        documentId: after.header.id,
        documentType: after.header.documentType,
        scope: row.scope,
        branch: after.header.branch,
        ordinal: Number(input.evaluationOrdinal),
      },
    };
    const evaluationOrdinal = operationWithContext.context.ordinal;
    operationWithContext.context.ordinal = Number(input.committedOrdinal);
    return finishDocument({
      before,
      after,
      implementation,
      selectedModuleVersion: row.version,
      extraState: {
        actionContext: action.context as unknown as JsonValue,
        evaluationOrdinal,
        committedOrdinal: operationWithContext.context.ordinal,
      },
    });
  }

  if (row.rowId === "upgrade-v1-v2") {
    const family = familyFor(implementation);
    let prepared = reduce(
      module,
      before,
      rawAction({
        id: "action-1",
        type: "INCREMENT",
        input: {
          amount: input.amountBeforeUpgrade,
          tag: "before-upgrade",
        },
        scope: "global",
      }),
    );
    const transitions = computeUpgradeTransitions(
      family.upgradeManifest,
      Number(input.fromVersion),
      Number(input.toVersion),
    );
    prepared = applyUpgradeDocumentAction(
      prepared,
      rawAction({
        id: "upgrade-1",
        type: "UPGRADE_DOCUMENT",
        input: {
          documentId: prepared.header.id,
          model: prepared.header.documentType,
          fromVersion: Number(input.fromVersion),
          toVersion: Number(input.toVersion),
        },
        scope: "document",
      }) as never,
      transitions,
    ) as PHDocument;
    const selected = moduleAt(implementation, Number(input.toVersion));
    if (!selected.utils.isDocumentOfType(prepared)) {
      throw new Error("The upgraded document does not satisfy version 2.");
    }
    return finishDocument({
      before,
      after: prepared,
      implementation,
      outcomeCode: "upgraded",
      selectedModuleVersion: normalizeDocumentModelVersion(selected.version),
      upgradePath: transitions.map(({ toVersion }) => toVersion),
    });
  }

  throw new Error(`No protocol executor for ${row.rowId}.`);
}

export function createProtocolMatrixCases(): readonly ProtocolMatrixCase[] {
  return PROTOCOL_MATRIX_ROWS.map((row) => ({
    ...row,
    expected: executeProtocolMatrixRow("legacy", row),
  }));
}

type AssertionId = ProtocolMatrixAssertion["id"];

const VALIDATION_ROWS = new Set([
  "creator-valid",
  "creator-invalid",
  "raw-invalid",
  "extra-keys-preserved",
  "no-input-creator-absent",
  "no-input-declaration-rejected",
  "duplicate-action-type-rejects-complete-model",
]);
const SCOPE_ROWS = new Set([
  "creator-valid",
  "wrong-scope-core-v1",
  "unknown-runtime-scope",
]);
const ERROR_ROWS = new Set([
  "creator-invalid",
  "raw-invalid",
  "unknown-runtime-scope",
  "domain-error-default",
  "domain-error-explicit",
  "denied-operation-replay",
]);
const VERSION_ROWS = new Set(["stored-version-zero", "version-selection-v2"]);
const UPGRADE_ROWS = new Set(["upgrade-v1-v2"]);

function assertionIdsFor(rowId: string): readonly AssertionId[] {
  const ids: AssertionId[] = ["B3.state", "B3.hash", "B3.dispatch"];
  if (VALIDATION_ROWS.has(rowId)) ids.push("B3.validation");
  if (SCOPE_ROWS.has(rowId)) ids.push("B3.scope");
  if (ERROR_ROWS.has(rowId)) ids.push("B3.error");
  if (VERSION_ROWS.has(rowId)) ids.push("B3.version");
  if (UPGRADE_ROWS.has(rowId)) ids.push("B3.upgrade");
  return ids;
}

export async function evaluateProtocolMatrix(
  manifestPath: string,
): Promise<ProtocolMatrixEvaluation> {
  const bytes = await readFile(manifestPath);
  const manifest = JSON.parse(bytes.toString("utf8")) as ProtocolMatrixManifest;
  const failures = new Map<AssertionId, string[]>(
    [
      "B3.validation",
      "B3.scope",
      "B3.state",
      "B3.hash",
      "B3.error",
      "B3.dispatch",
      "B3.version",
      "B3.upgrade",
    ].map((id) => [id as AssertionId, []]),
  );
  const rows: ProtocolMatrixResultRow[] = [];
  const routeCoverage = new Set<ProtocolRoute>();

  for (const row of manifest.cases) {
    routeCoverage.add(row.route);
    const legacy = executeProtocolMatrixRow("legacy", row);
    const codeFirst = executeProtocolMatrixRow("code-first", row);
    const expectedDifference = firstDifference(row.expected, codeFirst);
    const parityDifference = firstDifference(legacy, codeFirst);
    const mismatch = expectedDifference ?? parityDifference;
    if (mismatch) {
      for (const assertionId of assertionIdsFor(row.rowId)) {
        failures.get(assertionId)?.push(`${row.rowId}: ${mismatch}`);
      }
    }

    const coordinateChecks: readonly [AssertionId, unknown, unknown][] = [
      ["B3.state", row.expected.state, codeFirst.state],
      ["B3.hash", row.expected.hashDelta, codeFirst.hashDelta],
      ["B3.error", row.expected.errors, codeFirst.errors],
      ["B3.dispatch", row.expected.dispatches, codeFirst.dispatches],
      [
        "B3.version",
        row.expected.selectedModuleVersion,
        codeFirst.selectedModuleVersion,
      ],
      ["B3.upgrade", row.expected.upgradePath, codeFirst.upgradePath],
    ];
    for (const [assertionId, expected, received] of coordinateChecks) {
      if (!assertionIdsFor(row.rowId).includes(assertionId)) continue;
      const coordinateDifference = firstDifference(expected, received);
      if (coordinateDifference) {
        failures
          .get(assertionId)
          ?.push(`${row.rowId}: ${coordinateDifference}`);
      }
    }

    rows.push({
      rowId: row.rowId,
      route: row.route,
      version: row.version,
      scope: row.scope,
      outcomeCode: codeFirst.outcomeCode,
      stateDigest: sha256(canonicalProtocolJson(codeFirst.state)),
      hashDigest: sha256(canonicalProtocolJson(codeFirst.hashDelta)),
      errorCode: codeFirst.errorCode,
      dispatchDigest: sha256(
        canonicalProtocolJson(codeFirst.dispatches as JsonValue),
      ),
      selectedModuleVersion: codeFirst.selectedModuleVersion,
      upgradePath: codeFirst.upgradePath,
      firstMismatch: mismatch,
    });
  }

  const rowIds = new Set(manifest.cases.map(({ rowId }) => rowId));
  for (const expected of PROTOCOL_MATRIX_ROWS) {
    if (!rowIds.has(expected.rowId)) {
      failures
        .get("B3.validation")
        ?.push(`missing required row ${expected.rowId}`);
    }
  }
  for (const route of PROTOCOL_ROUTES) {
    if (!routeCoverage.has(route)) {
      failures.get("B3.validation")?.push(`missing route ${route}`);
    }
  }

  const assertions = [...failures].map(([id, assertionFailures]) => ({
    id,
    outcome:
      assertionFailures.length === 0 ? ("pass" as const) : ("fail" as const),
    failures: [...new Set(assertionFailures)].sort(compareCodeUnits),
  }));
  return {
    matrixDigest: sha256(bytes),
    rows,
    assertions,
  };
}
