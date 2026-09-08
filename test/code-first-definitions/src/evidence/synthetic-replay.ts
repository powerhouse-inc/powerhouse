import {
  hashDocumentStateForScope,
  replayDocument,
  replayDocumentVersioned,
  type Action,
  type DocumentModelModule,
  type DocumentOperations,
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
  type ProtocolImplementation,
} from "../../fixtures/protocol/v1/family.js";
import {
  canonicalJson,
  cloneJsonValue,
  compareCodeUnits,
  sha256,
} from "./utils.js";

export const SYNTHETIC_REPLAY_ASSERTION_IDS = [
  "B2.state",
  "B2.initial",
  "B2.scope-hash",
  "B2.error",
  "B2.denial",
  "B2.index",
  "B2.skip",
  "B2.revision",
  "B2.dispatches",
] as const;

export type SyntheticReplayAssertionId =
  (typeof SYNTHETIC_REPLAY_ASSERTION_IDS)[number];

export type SyntheticReplayHistory = {
  readonly caseId: string;
  readonly documentType: "powerhouse/protocol-matrix";
  readonly mode: "single-version" | "versioned";
  readonly version: number;
  readonly initialState: PHDocument["initialState"];
  readonly header: PHDocument["header"];
  readonly operations: readonly Operation[];
  readonly coveredActionTypes: readonly string[];
  readonly scopes: readonly string[];
  readonly outcomes: readonly ("applied" | "reducer-error" | "denied")[];
  readonly upgradeEdges: readonly string[];
};

export type SyntheticReplayHistorySet = {
  readonly kind: "powerhouse.synthetic-replay-histories";
  readonly formatVersion: 1;
  readonly profile: "synthetic-only-v1";
  readonly histories: readonly SyntheticReplayHistory[];
};

export type SyntheticPrefixProjection = {
  readonly caseId: string;
  readonly prefixIndex: number;
  readonly state: JsonValue;
  readonly initialState: JsonValue;
  readonly scopeHashes: Readonly<Record<string, string>>;
  readonly errors: readonly (string | null)[];
  readonly denials: readonly (string | null)[];
  readonly indices: readonly number[];
  readonly skips: readonly number[];
  readonly revision: Readonly<Record<string, number>>;
  readonly dispatches: readonly JsonValue[];
};

export type SyntheticPrefixArtifact = {
  readonly kind: "powerhouse.synthetic-replay-prefixes";
  readonly formatVersion: 1;
  readonly hashAlgorithmVersion: "shared/hashDocumentStateForScope@1";
  readonly prefixes: readonly SyntheticPrefixProjection[];
};

export type SyntheticReplayManifest = {
  readonly kind: "powerhouse.gate-fixture-manifest";
  readonly formatVersion: 1;
  readonly gate: "B2";
  readonly fixtureVersion: string;
  readonly requiredTools: Readonly<Record<string, string>>;
  readonly schemaDigest: `sha256:${string}`;
  readonly directDependencies: readonly {
    readonly gate: "B1" | "B3" | "B9";
    readonly contractRevision: `sha256:${string}`;
    readonly fixtureManifestDigest: `sha256:${string}`;
  }[];
  readonly profile: "synthetic-only-v1";
  readonly productionCorpusStatus: "not-established";
  readonly historySet: `./${string}`;
  readonly expectedPrefixes: `./${string}`;
  readonly scopeDeclaration: `./${string}`;
  readonly caseCount: number;
  readonly cases: readonly {
    readonly caseId: string;
    readonly documentType: string;
    readonly version: number;
    readonly mode: "single-version" | "versioned";
    readonly operationCount: number;
    readonly prefixCount: number;
    readonly coveredActionTypes: readonly string[];
    readonly scopes: readonly string[];
    readonly outcomes: readonly string[];
    readonly upgradeEdges: readonly string[];
  }[];
};

export type SyntheticReplayDivergence = {
  readonly caseId: string;
  readonly prefixIndex: number;
  readonly scope: string;
  readonly coordinate: string;
};

export type SyntheticReplayEvaluation = {
  readonly assertions: readonly {
    readonly id: SyntheticReplayAssertionId;
    readonly outcome: "pass" | "fail";
    readonly failures: readonly string[];
  }[];
  readonly corpusDigest: `sha256:${string}`;
  readonly familyDigests: readonly {
    readonly documentType: string;
    readonly version: number;
    readonly legacy: `sha256:${string}`;
    readonly codeFirst: `sha256:${string}`;
  }[];
  readonly strata: readonly {
    readonly id: "synthetic" | "production";
    readonly status: "pass" | "not-established";
    readonly caseCount: number;
  }[];
  readonly operationCount: number;
  readonly prefixCount: number;
  readonly assertionCounts: Readonly<
    Record<SyntheticReplayAssertionId, number>
  >;
  readonly hashAlgorithmVersion: "shared/hashDocumentStateForScope@1";
  readonly productionCorpusStatus: "not-established";
  readonly divergences: readonly SyntheticReplayDivergence[];
  readonly prefixes: readonly SyntheticPrefixProjection[];
};

function moduleAt(
  implementation: ProtocolImplementation,
  version: number,
): DocumentModelModule {
  const family =
    implementation === "legacy"
      ? LegacyProtocolFamily
      : CodeFirstProtocolFamily;
  const module = family.modules.find(
    (candidate) => (candidate.version ?? 1) === version,
  );
  if (!module) {
    throw new Error(
      `No ${implementation} protocol fixture version ${version}.`,
    );
  }
  return module as unknown as DocumentModelModule;
}

function deterministicDocument(module: DocumentModelModule): PHDocument {
  const created = module.utils.createDocument() as PHDocument;
  const state = structuredClone(created.state);
  return {
    ...created,
    header: {
      ...created.header,
      id: "synthetic-replay-document",
      slug: "synthetic-replay-document",
      name: "Synthetic Replay Document",
      branch: "main",
      createdAtUtcIso: "2025-01-01T00:00:00.000Z",
      lastModifiedAtUtcIso: "2025-01-01T00:00:00.000Z",
      revision: { global: 0, local: 0, document: 0 },
      protocolVersions: { "base-reducer": 1 },
    },
    state,
    initialState: structuredClone(state),
    operations: { global: [], local: [], document: [] },
    clipboard: [],
  };
}

function action(request: {
  readonly sequence: number;
  readonly type: string;
  readonly scope: string;
  readonly input: unknown;
}): Action {
  const timestampUtcMs = `2025-01-01T00:00:${String(request.sequence).padStart(2, "0")}.000Z`;
  return {
    id: `synthetic-action-${request.sequence}`,
    type: request.type,
    scope: request.scope,
    input: request.input,
    timestampUtcMs,
  };
}

function normalizedOperation(
  operation: Operation,
  overrides: Partial<Operation> = {},
): Operation {
  const normalized = {
    ...structuredClone(operation),
    hash: "",
    ...overrides,
  };
  delete normalized.error;
  delete normalized.resultingState;
  return normalized;
}

function operationFromAction(request: {
  readonly module: DocumentModelModule;
  readonly document: PHDocument;
  readonly action: Action;
}): { readonly document: PHDocument; readonly operation: Operation } {
  const document = request.module.reducer(
    request.document,
    request.action,
    undefined,
    { protocolVersion: 1 },
  ) as PHDocument;
  const operation = document.operations[request.action.scope]?.at(-1);
  if (!operation) {
    throw new Error(`Action ${request.action.type} produced no operation.`);
  }
  return { document, operation: normalizedOperation(operation) };
}

function singleVersionHistory(request: {
  readonly caseId: string;
  readonly version: 1 | 2;
  readonly actions: readonly Action[];
  readonly deniedActionId?: string;
  readonly skipActionId?: string;
}): SyntheticReplayHistory {
  const module = moduleAt("legacy", request.version);
  const initial = deterministicDocument(module);
  let current = initial;
  const operations: Operation[] = [];
  for (const rawAction of request.actions) {
    const applied = operationFromAction({
      module,
      document: current,
      action: rawAction,
    });
    current = applied.document;
    operations.push(
      normalizedOperation(applied.operation, {
        ...(rawAction.id === request.deniedActionId
          ? { deniedReason: "fixture-policy-denied" }
          : {}),
        ...(rawAction.id === request.skipActionId ? { skip: 1 } : {}),
      }),
    );
  }
  return {
    caseId: request.caseId,
    documentType: "powerhouse/protocol-matrix",
    mode: "single-version",
    version: request.version,
    initialState: initial.initialState,
    header: initial.header,
    operations,
    coveredActionTypes: [
      ...new Set(operations.map(({ action }) => action.type)),
    ].sort(compareCodeUnits),
    scopes: [...new Set(operations.map(({ action }) => action.scope))].sort(
      compareCodeUnits,
    ),
    outcomes: ["applied", "reducer-error", "denied"],
    upgradeEdges: [],
  };
}

function rawOperation(request: {
  readonly id: string;
  readonly index: number;
  readonly sequence: number;
  readonly type: string;
  readonly scope: string;
  readonly input: unknown;
}): Operation {
  const rawAction = action({
    sequence: request.sequence,
    type: request.type,
    scope: request.scope,
    input: request.input,
  });
  return {
    id: request.id,
    index: request.index,
    skip: 0,
    hash: "",
    timestampUtcMs: rawAction.timestampUtcMs,
    action: rawAction,
  };
}

function versionedHistory(): SyntheticReplayHistory {
  const v1 = moduleAt("legacy", 1);
  const v2 = moduleAt("legacy", 2);
  const initial = deterministicDocument(v1);
  const beforeUpgrade = operationFromAction({
    module: v1,
    document: initial,
    action: action({
      sequence: 1,
      type: "INCREMENT",
      scope: "global",
      input: { amount: 4, tag: "before-upgrade" },
    }),
  }).operation;
  const v2Seed = deterministicDocument(v2);
  const afterUpgrade = operationFromAction({
    module: v2,
    document: v2Seed,
    action: action({
      sequence: 3,
      type: "SET_TITLE",
      scope: "global",
      input: { title: "After upgrade" },
    }),
  }).operation;
  const operations = [
    rawOperation({
      id: "synthetic-seed-v1",
      index: 0,
      sequence: 0,
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      input: {
        documentId: initial.header.id,
        model: initial.header.documentType,
        fromVersion: 0,
        toVersion: 1,
        initialState: initial.initialState,
      },
    }),
    normalizedOperation(beforeUpgrade),
    rawOperation({
      id: "synthetic-upgrade-v2",
      index: 1,
      sequence: 2,
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      input: {
        documentId: initial.header.id,
        model: initial.header.documentType,
        fromVersion: 1,
        toVersion: 2,
        revision: { global: 1, local: 0, document: 1 },
      },
    }),
    normalizedOperation(afterUpgrade, { index: 1 }),
  ].sort((left, right) =>
    compareCodeUnits(left.timestampUtcMs, right.timestampUtcMs),
  );
  return {
    caseId: "protocol-upgrade-v1-v2",
    documentType: "powerhouse/protocol-matrix",
    mode: "versioned",
    version: 1,
    initialState: initial.initialState,
    header: initial.header,
    operations,
    coveredActionTypes: ["INCREMENT", "SET_TITLE", "UPGRADE_DOCUMENT"],
    scopes: ["document", "global"],
    outcomes: ["applied"],
    upgradeEdges: ["1->2"],
  };
}

export function createSyntheticReplayHistories(): SyntheticReplayHistorySet {
  return {
    kind: "powerhouse.synthetic-replay-histories",
    formatVersion: 1,
    profile: "synthetic-only-v1",
    histories: [
      singleVersionHistory({
        caseId: "protocol-v1-mixed-outcomes",
        version: 1,
        actions: [
          action({
            sequence: 1,
            type: "INCREMENT",
            scope: "global",
            input: { amount: 2, tag: "first" },
          }),
          action({
            sequence: 2,
            type: "SET_DRAFT",
            scope: "local",
            input: { draft: "local-draft" },
          }),
          action({
            sequence: 3,
            type: "FAIL",
            scope: "global",
            input: { explicit: false },
          }),
          action({
            sequence: 4,
            type: "EMIT",
            scope: "global",
            input: { id: "child-synthetic" },
          }),
          action({
            sequence: 5,
            type: "INCREMENT",
            scope: "global",
            input: { amount: 100, tag: "denied" },
          }),
          action({
            sequence: 6,
            type: "INCREMENT",
            scope: "global",
            input: { amount: 3, tag: "skip-preserved" },
          }),
        ],
        deniedActionId: "synthetic-action-5",
        skipActionId: "synthetic-action-6",
      }),
      singleVersionHistory({
        caseId: "protocol-v2-global-local",
        version: 2,
        actions: [
          action({
            sequence: 1,
            type: "SET_TITLE",
            scope: "global",
            input: { title: "Version two" },
          }),
          action({
            sequence: 2,
            type: "INCREMENT",
            scope: "global",
            input: { amount: 7, tag: "v2" },
          }),
          action({
            sequence: 3,
            type: "SET_DRAFT",
            scope: "local",
            input: { draft: "v2-local" },
          }),
          action({
            sequence: 4,
            type: "EMIT",
            scope: "global",
            input: { id: "v2-child" },
          }),
        ],
      }),
      versionedHistory(),
    ],
  };
}

function operationsAtPrefix(
  history: SyntheticReplayHistory,
  prefixIndex: number,
): DocumentOperations {
  const operations: DocumentOperations = {
    global: [],
    local: [],
    document: [],
  };
  for (const operation of history.operations.slice(0, prefixIndex)) {
    (operations[operation.action.scope] ??= []).push(
      structuredClone(operation),
    );
  }
  return operations;
}

function replayPrefix(
  implementation: ProtocolImplementation,
  history: SyntheticReplayHistory,
  prefixIndex: number,
): SyntheticPrefixProjection {
  const dispatches: Signal[] = [];
  const operations = operationsAtPrefix(history, prefixIndex);
  let document: PHDocument;
  if (history.mode === "versioned") {
    const family =
      implementation === "legacy"
        ? LegacyProtocolFamily
        : CodeFirstProtocolFamily;
    document = replayDocumentVersioned(
      structuredClone(history.initialState),
      operations,
      {
        reducers: Object.fromEntries(
          family.modules.map((module) => [module.version ?? 1, module.reducer]),
        ) as never,
        upgradeManifest: family.upgradeManifest as UpgradeManifest<
          readonly number[]
        >,
      },
      structuredClone(history.header),
      (signal) => dispatches.push(signal),
      {
        checkHashes: true,
        reuseOperationResultingState: false,
      },
    ) as PHDocument;
  } else {
    const module = moduleAt(implementation, history.version);
    document = replayDocument(
      structuredClone(history.initialState),
      operations,
      module.reducer,
      structuredClone(history.header),
      (signal) => dispatches.push(signal),
      {},
      {
        checkHashes: true,
        reuseOperationResultingState: false,
      },
    ) as PHDocument;
  }
  const flattened = Object.values(document.operations)
    .flatMap((entries) => entries ?? [])
    .sort((left, right) =>
      compareCodeUnits(left.timestampUtcMs, right.timestampUtcMs),
    );
  const scopes = Object.keys(document.state)
    .filter((scope) => scope !== "auth")
    .sort(compareCodeUnits);
  return {
    caseId: history.caseId,
    prefixIndex,
    state: cloneJsonValue(document.state),
    initialState: cloneJsonValue(document.initialState),
    scopeHashes: Object.fromEntries(
      scopes.map((scope) => [
        scope,
        hashDocumentStateForScope(document, scope),
      ]),
    ),
    errors: flattened.map(({ error }) => error ?? null),
    denials: flattened.map(({ deniedReason }) => deniedReason ?? null),
    indices: flattened.map(({ index }) => index),
    skips: flattened.map(({ skip }) => skip),
    revision: Object.fromEntries(
      Object.entries(document.header.revision).sort(([left], [right]) =>
        compareCodeUnits(left, right),
      ),
    ),
    dispatches: dispatches.map(cloneJsonValue),
  };
}

export function createSyntheticPrefixArtifact(
  histories: SyntheticReplayHistorySet,
): SyntheticPrefixArtifact {
  return {
    kind: "powerhouse.synthetic-replay-prefixes",
    formatVersion: 1,
    hashAlgorithmVersion: "shared/hashDocumentStateForScope@1",
    prefixes: histories.histories.flatMap((history) =>
      Array.from({ length: history.operations.length + 1 }, (_, prefixIndex) =>
        replayPrefix("legacy", history, prefixIndex),
      ),
    ),
  };
}

function coordinateValue(
  projection: SyntheticPrefixProjection,
  assertionId: SyntheticReplayAssertionId,
): unknown {
  switch (assertionId) {
    case "B2.state":
      return projection.state;
    case "B2.initial":
      return projection.initialState;
    case "B2.scope-hash":
      return projection.scopeHashes;
    case "B2.error":
      return projection.errors;
    case "B2.denial":
      return projection.denials;
    case "B2.index":
      return projection.indices;
    case "B2.skip":
      return projection.skips;
    case "B2.revision":
      return projection.revision;
    case "B2.dispatches":
      return projection.dispatches;
  }
}

function familyDigest(module: DocumentModelModule): `sha256:${string}` {
  return sha256(canonicalJson(module.definition ?? module.documentModel));
}

export async function evaluateSyntheticReplay(
  manifestPath: string,
): Promise<SyntheticReplayEvaluation> {
  const manifest = JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as SyntheticReplayManifest;
  const historyBytes = await readFile(
    new URL(manifest.historySet, `file://${manifestPath}`),
  );
  const histories = JSON.parse(
    historyBytes.toString("utf8"),
  ) as SyntheticReplayHistorySet;
  const expected = JSON.parse(
    await readFile(
      new URL(manifest.expectedPrefixes, `file://${manifestPath}`),
      "utf8",
    ),
  ) as SyntheticPrefixArtifact;
  const expectedByKey = new Map(
    expected.prefixes.map((projection) => [
      `${projection.caseId}:${projection.prefixIndex}`,
      projection,
    ]),
  );
  const failures = new Map<SyntheticReplayAssertionId, string[]>(
    SYNTHETIC_REPLAY_ASSERTION_IDS.map((id) => [id, []]),
  );
  const divergences: SyntheticReplayDivergence[] = [];
  const prefixes: SyntheticPrefixProjection[] = [];
  for (const history of histories.histories) {
    for (
      let prefixIndex = 0;
      prefixIndex <= history.operations.length;
      prefixIndex += 1
    ) {
      const legacy = replayPrefix("legacy", history, prefixIndex);
      const codeFirst = replayPrefix("code-first", history, prefixIndex);
      const golden = expectedByKey.get(`${history.caseId}:${prefixIndex}`);
      if (!golden) {
        for (const id of SYNTHETIC_REPLAY_ASSERTION_IDS) {
          failures
            .get(id)
            ?.push(`${history.caseId}@${prefixIndex}:missing-golden`);
        }
        continue;
      }
      prefixes.push(codeFirst);
      for (const id of SYNTHETIC_REPLAY_ASSERTION_IDS) {
        const legacyValue = canonicalJson(coordinateValue(legacy, id));
        const codeFirstValue = canonicalJson(coordinateValue(codeFirst, id));
        const goldenValue = canonicalJson(coordinateValue(golden, id));
        if (legacyValue !== codeFirstValue || legacyValue !== goldenValue) {
          const coordinate = id.slice("B2.".length);
          failures
            .get(id)
            ?.push(`${history.caseId}@${prefixIndex}:${coordinate}`);
          divergences.push({
            caseId: history.caseId,
            prefixIndex,
            scope: "*",
            coordinate,
          });
        }
      }
    }
  }
  const prefixCount = histories.histories.reduce(
    (total, history) => total + history.operations.length + 1,
    0,
  );
  return {
    assertions: SYNTHETIC_REPLAY_ASSERTION_IDS.map((id) => ({
      id,
      outcome: failures.get(id)?.length ? "fail" : "pass",
      failures: failures.get(id) ?? [],
    })),
    corpusDigest: sha256(historyBytes),
    familyDigests: [1, 2].map((version) => ({
      documentType: "powerhouse/protocol-matrix",
      version,
      legacy: familyDigest(moduleAt("legacy", version)),
      codeFirst: familyDigest(moduleAt("code-first", version)),
    })),
    strata: [
      {
        id: "synthetic",
        status: "pass",
        caseCount: histories.histories.length,
      },
      { id: "production", status: "not-established", caseCount: 0 },
    ],
    operationCount: histories.histories.reduce(
      (total, history) => total + history.operations.length,
      0,
    ),
    prefixCount,
    assertionCounts: Object.fromEntries(
      SYNTHETIC_REPLAY_ASSERTION_IDS.map((id) => [id, prefixCount]),
    ) as Readonly<Record<SyntheticReplayAssertionId, number>>,
    hashAlgorithmVersion: expected.hashAlgorithmVersion,
    productionCorpusStatus: "not-established",
    divergences,
    prefixes,
  };
}
