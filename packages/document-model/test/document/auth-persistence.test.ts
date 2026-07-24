import type {
  Action,
  CreateState,
  Grant,
  Operation,
  PHBaseState,
  PHDocument,
  Reducer,
  StateReducer,
  UpgradeDocumentAction,
  UpgradeManifest,
  UpgradeTransition,
} from "@powerhousedao/shared/document-model";
import {
  applyUpgradeDocumentAction,
  baseCreateDocument,
  baseLoadFromInput,
  baseLoadFromInputVersioned,
  computeUpgradeTransitions,
  createReducer,
  createZip,
  defaultBaseState,
  initializeAuth,
  setGrant,
} from "@powerhousedao/shared/document-model";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";

// Cast a typed reducer to PHBaseState for use in VersionedReplayConfig.reducers
function r<TState extends PHBaseState>(
  reducer: Reducer<TState>,
): Reducer<PHBaseState> {
  return reducer as unknown as Reducer<PHBaseState>;
}

type CounterGlobal = { count: number };
type CounterState = PHBaseState & {
  global: CounterGlobal;
  local: Record<string, never>;
};

const docType = "test/auth-counter";

const createCounterState: CreateState<CounterState> = (partial) => ({
  ...defaultBaseState(),
  document: { ...defaultBaseState().document, version: 1 },
  global: { count: 0, ...partial?.global },
  local: {},
});

const counterStateReducer: StateReducer<CounterState> = (state, action) => {
  if (action.type === "INCREMENT") {
    state.global.count += 1;
  }
  return undefined;
};

const counterReducer = createReducer<CounterState>(counterStateReducer);

const identityTransitionV2: UpgradeTransition = {
  toVersion: 2,
  upgradeReducer: (doc) => doc,
  description: "No state change",
};

const counterManifest: UpgradeManifest<readonly [1, 2]> = {
  documentType: docType,
  latestVersion: 2,
  supportedVersions: [1, 2] as const,
  upgrades: {
    v2: identityTransitionV2,
  },
};

function makeTimestamp(offsetMs: number): string {
  return new Date(1700000000000 + offsetMs).toISOString();
}

function increment(ts: string): Action {
  return {
    id: randomUUID(),
    type: "INCREMENT",
    scope: "global",
    timestampUtcMs: ts,
    input: {},
  };
}

function makeGrant(id: string): Grant {
  return {
    id,
    description: `grant ${id}`,
    effect: "allow",
    principal: { anyone: true },
    capability: { can: "read", scope: "global" },
  };
}

function initAuthAt(ts: string, grants: Grant[]): Action {
  return { ...initializeAuth({ version: 1, grants }), timestampUtcMs: ts };
}

function setGrantAt(ts: string, grant: Grant): Action {
  return { ...setGrant({ grant }), timestampUtcMs: ts };
}

/** Builds a live document with auth and domain history interleaved. */
function buildLiveDocument(): PHDocument<CounterState> {
  let doc = baseCreateDocument<CounterState>(
    createCounterState,
    undefined,
    docType,
  );
  doc = counterReducer(doc, initAuthAt(makeTimestamp(0), [makeGrant("a")]));
  doc = counterReducer(doc, increment(makeTimestamp(100)));
  doc = counterReducer(doc, setGrantAt(makeTimestamp(200), makeGrant("b")));
  doc = counterReducer(doc, increment(makeTimestamp(300)));
  return doc;
}

/** Appends a v1->v2 UPGRADE_DOCUMENT op plus post-upgrade auth/domain ops. */
function upgradeAndExtend(
  doc: PHDocument<CounterState>,
  opts: { stampRevision: boolean },
): PHDocument<CounterState> {
  const tsUpgrade = makeTimestamp(400);

  const revisionSnapshot: Record<string, number> = {};
  if (opts.stampRevision) {
    for (const scope of Object.keys(doc.operations)) {
      const ops = doc.operations[scope] ?? [];
      const lastOp = ops.at(-1);
      revisionSnapshot[scope] = lastOp !== undefined ? lastOp.index + 1 : 0;
    }
  }

  const upgradeAction: UpgradeDocumentAction = {
    id: randomUUID(),
    type: "UPGRADE_DOCUMENT",
    scope: "document",
    timestampUtcMs: tsUpgrade,
    input: {
      model: docType,
      fromVersion: 1,
      toVersion: 2,
      documentId: doc.header.id,
      ...(opts.stampRevision ? { revision: revisionSnapshot } : {}),
    },
  };

  const transitions = computeUpgradeTransitions(counterManifest, 1, 2);
  let upgraded = applyUpgradeDocumentAction(
    doc,
    upgradeAction,
    transitions,
  ) as PHDocument<CounterState>;

  const docScopeOps = upgraded.operations["document"] ?? [];
  const upgradeOp: Operation = {
    id: randomUUID(),
    index: docScopeOps.length > 0 ? (docScopeOps.at(-1)?.index ?? -1) + 1 : 0,
    skip: 0,
    timestampUtcMs: tsUpgrade,
    hash: "",
    action: upgradeAction,
  };
  upgraded = {
    ...upgraded,
    operations: {
      ...upgraded.operations,
      document: [...docScopeOps, upgradeOp],
    },
  };

  upgraded = counterReducer(upgraded, increment(makeTimestamp(500)));
  upgraded = counterReducer(
    upgraded,
    setGrantAt(makeTimestamp(600), makeGrant("c")),
  );
  return upgraded;
}

describe("auth persistence through zip save/load", () => {
  it("round-trips the auth policy and its operation history", async () => {
    const liveDoc = buildLiveDocument();
    expect(liveDoc.state.auth.grants.map((g) => g.id)).toEqual(["a", "b"]);

    const zipData = await createZip(liveDoc);
    const loaded = await baseLoadFromInput<CounterState>(
      zipData,
      counterReducer,
    );

    expect(loaded.state.auth).toEqual(liveDoc.state.auth);
    expect(loaded.state.auth.version).toBe(1);
    expect(loaded.operations.auth).toHaveLength(2);
    expect(loaded.state.global.count).toBe(2);
  });

  it("round-trips a history containing an errored auth operation", async () => {
    let liveDoc = buildLiveDocument();
    // a second INITIALIZE_AUTH is recorded as an error operation
    liveDoc = counterReducer(
      liveDoc,
      initAuthAt(makeTimestamp(350), [makeGrant("z")]),
    );
    expect(liveDoc.operations.auth?.[2].error).toBeTruthy();

    const zipData = await createZip(liveDoc);
    const loaded = await baseLoadFromInput<CounterState>(
      zipData,
      counterReducer,
    );

    expect(loaded.state.auth).toEqual(liveDoc.state.auth);
    expect(loaded.state.auth.grants.map((g) => g.id)).toEqual(["a", "b"]);
    expect(loaded.operations.auth?.[2].error).toBeTruthy();
  });

  it("loads a legacy zip with no auth operations as an uninitialized policy", async () => {
    let doc = baseCreateDocument<CounterState>(
      createCounterState,
      undefined,
      docType,
    );
    doc = counterReducer(doc, increment(makeTimestamp(0)));

    const zipData = await createZip(doc);
    const loaded = await baseLoadFromInput<CounterState>(
      zipData,
      counterReducer,
    );

    expect(loaded.state.auth).toEqual({ version: 0, grants: [] });
    expect(loaded.state.global.count).toBe(1);
  });
});

describe("auth persistence through versioned replay", () => {
  for (const stampRevision of [true, false]) {
    it(`replays and preserves auth operations across an upgrade (stampRevision: ${stampRevision})`, async () => {
      const liveDoc = upgradeAndExtend(buildLiveDocument(), { stampRevision });
      expect(liveDoc.state.auth.grants.map((g) => g.id)).toEqual([
        "a",
        "b",
        "c",
      ]);

      const zipData = await createZip(liveDoc);
      const loaded = await baseLoadFromInputVersioned<CounterState>(zipData, {
        reducers: { 1: r(counterReducer), 2: r(counterReducer) },
        upgradeManifest: counterManifest,
      });

      expect(loaded.state.auth).toEqual(liveDoc.state.auth);
      expect(loaded.state.auth.version).toBe(1);
      expect(loaded.operations.auth).toHaveLength(3);
      expect(loaded.state.global.count).toBe(3);

      // the verifying mode replays auth hashes identically
      const verified = await baseLoadFromInputVersioned<CounterState>(
        zipData,
        {
          reducers: { 1: r(counterReducer), 2: r(counterReducer) },
          upgradeManifest: counterManifest,
        },
        { checkHashes: false },
      );
      expect(verified.state.auth).toEqual(liveDoc.state.auth);
      expect(verified.operations.auth).toHaveLength(3);
    });
  }

  it("replays auth operations through the versioned path with no version upgrades", async () => {
    const liveDoc = buildLiveDocument();
    const zipData = await createZip(liveDoc);

    const loaded = await baseLoadFromInputVersioned<CounterState>(zipData, {
      reducers: { 1: r(counterReducer) },
    });

    expect(loaded.state.auth).toEqual(liveDoc.state.auth);
    expect(loaded.operations.auth).toHaveLength(2);
    expect(loaded.state.global.count).toBe(2);
  });

  it("replays auth operations through the legacy fallback (no document spine)", async () => {
    const liveDoc = buildLiveDocument();
    const withoutSpine = {
      ...liveDoc,
      operations: Object.fromEntries(
        Object.entries(liveDoc.operations).filter(([s]) => s !== "document"),
      ),
    } as PHDocument<CounterState>;
    const zipData = await createZip(withoutSpine);

    const loaded = await baseLoadFromInputVersioned<CounterState>(zipData, {
      reducers: { 1: r(counterReducer) },
    });

    expect(loaded.state.auth).toEqual(liveDoc.state.auth);
    expect(loaded.operations.auth).toHaveLength(2);
    expect(loaded.state.global.count).toBe(2);
  });
});
