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

// Keeps a creator-less policy administrable, which genesis now requires.
function adminGrant(id: string): Grant {
  return {
    id,
    description: `admin grant ${id}`,
    effect: "allow",
    principal: { anyone: true },
    capability: { can: "execute", scope: "auth" },
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
  doc = counterReducer(doc, initAuthAt(makeTimestamp(0), [adminGrant("a")]));
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

  /**
   * A document loaded from a file has to reach the same state the reactor that
   * wrote it holds.
   */
  it("round-trips a history containing a denied auth operation without applying it", async () => {
    const liveDoc = buildLiveDocument();

    // A refused SET_GRANT: recorded, hashed over the standing state.
    const authOps = liveDoc.operations.auth ?? [];
    const standing = authOps[authOps.length - 1];
    const deniedDoc = {
      ...liveDoc,
      operations: {
        ...liveDoc.operations,
        auth: [
          ...authOps,
          {
            ...standing,
            id: "op-denied-grant",
            index: authOps.length,
            action: {
              ...standing.action,
              id: "a-denied-grant",
              type: "SET_GRANT",
              input: { grant: makeGrant("denied") },
            },
            hash: standing.hash,
            deniedReason: "no grant permits this operation",
          },
        ],
      },
    };

    const zipData = await createZip(deniedDoc);

    // The legacy path.
    const loaded = await baseLoadFromInput<CounterState>(
      zipData,
      counterReducer,
    );
    expect(loaded.state.auth.grants.map((g) => g.id)).toEqual(["a", "b"]);
    expect(loaded.operations.auth?.[2].deniedReason).toBe(
      "no grant permits this operation",
    );

    // And the versioned path, which is what production calls.
    const versioned = await baseLoadFromInputVersioned<CounterState>(zipData, {
      reducers: { 1: r(counterReducer) },
    });
    expect(versioned.state.auth.grants.map((g) => g.id)).toEqual(["a", "b"]);
    expect(versioned.operations.auth?.[2].deniedReason).toBe(
      "no grant permits this operation",
    );
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

describe("a state snapshot is not a door onto the auth policy", () => {
  const initialized = (grants: Grant[]) => {
    const doc = baseCreateDocument<CounterState>(
      createCounterState,
      undefined,
      docType,
    );
    return {
      ...doc,
      state: { ...doc.state, auth: { version: 1, grants } },
    } as PHDocument<CounterState>;
  };

  const upgradeWith = (state: Record<string, unknown>) =>
    ({
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      input: {
        documentId: "doc-1",
        fromVersion: 0,
        toVersion: 1,
        initialState: state,
      },
    }) as unknown as UpgradeDocumentAction;

  it("rejects replacing an initialized policy, including a self-assigned creator", () => {
    // UPGRADE_DOCUMENT is authorized as a document-scope write, so without this
    // a subject with no auth grant could install a policy of its choosing and
    // name itself creator, which exempts the policy from retention for good.
    expect(() =>
      applyUpgradeDocumentAction(
        initialized([adminGrant("a")]),
        upgradeWith({
          auth: {
            version: 1,
            grants: [adminGrant("attacker")],
            creator: "did:key:zATTACKER",
          },
        }),
      ),
    ).toThrow(/policy/i);
  });

  it("keeps the existing policy when a snapshot carries the default one", () => {
    const upgraded = applyUpgradeDocumentAction(
      initialized([adminGrant("a")]),
      upgradeWith({ auth: { version: 0, grants: [] } }),
    );
    expect(upgraded.state.auth).toEqual({
      version: 1,
      grants: [adminGrant("a")],
    });
  });

  it("rejects installing a born-locked-out policy on an uninitialized document", () => {
    expect(() =>
      applyUpgradeDocumentAction(
        baseCreateDocument<CounterState>(
          createCounterState,
          undefined,
          docType,
        ),
        upgradeWith({ auth: { version: 1, grants: [] } }),
      ),
    ).toThrow(/no reachable grant permitting execute on the auth scope/);
  });

  it("installs a source policy onto an uninitialized document, as duplication does", () => {
    const upgraded = applyUpgradeDocumentAction(
      baseCreateDocument<CounterState>(createCounterState, undefined, docType),
      upgradeWith({ auth: { version: 1, grants: [adminGrant("a")] } }),
    );
    expect(upgraded.state.auth.grants.map((g) => g.id)).toEqual(["a"]);
  });

  it("leaves the policy alone for a snapshot carrying only domain state", () => {
    const upgraded = applyUpgradeDocumentAction(
      initialized([adminGrant("a")]),
      upgradeWith({ global: { count: 5 } }),
    );
    expect(upgraded.state.auth.grants.map((g) => g.id)).toEqual(["a"]);
    expect((upgraded.state as CounterState).global.count).toBe(5);
  });

  it("rejects a LOAD_STATE that replaces an initialized policy", () => {
    const doc = initialized([adminGrant("a")]);
    const load = {
      id: "act-load",
      type: "LOAD_STATE",
      scope: "global",
      input: {
        operations: 0,
        state: {
          name: "loaded",
          data: {
            ...doc.state,
            auth: { version: 1, grants: [adminGrant("attacker")] },
          },
        },
      },
      timestampUtcMs: makeTimestamp(0),
    } as unknown as Action;

    // Throws rather than recording an error operation, which is how this path
    // already treats an unusable LOAD_STATE input; the executor turns it into a
    // failed job and nothing is stored.
    expect(() => counterReducer(doc, load)).toThrow(/preserve its auth policy/);
  });

  it("accepts a LOAD_STATE carrying the policy the document already has", () => {
    const doc = initialized([adminGrant("a")]);
    const load = {
      id: "act-load-same",
      type: "LOAD_STATE",
      scope: "global",
      input: {
        operations: 0,
        state: { name: "loaded", data: { ...doc.state } },
      },
      timestampUtcMs: makeTimestamp(0),
    } as unknown as Action;

    const next = counterReducer(doc, load);
    expect(next.state.auth.grants.map((g) => g.id)).toEqual(["a"]);
  });
});
