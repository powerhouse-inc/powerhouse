import type {
  Action,
  CreateState,
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
  applyDeleteDocumentAction,
  applyUpgradeDocumentAction,
  baseCreateDocument,
  baseLoadFromInput,
  baseLoadFromInputVersioned,
  computeUpgradeTransitions,
  createAction,
  createReducer,
  createZip,
  defaultBaseState,
  DowngradeNotSupportedError,
  hashDocumentStateForScope,
} from "@powerhousedao/shared/document-model";

// Cast a typed reducer to PHBaseState for use in VersionedReplayConfig.reducers
function r<TState extends PHBaseState>(
  reducer: Reducer<TState>,
): Reducer<PHBaseState> {
  return reducer as unknown as Reducer<PHBaseState>;
}
import { randomUUID } from "crypto";
import { beforeEach, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Mini two-version counter/item model
// ---------------------------------------------------------------------------

// V1 state: has a "items" array with { id, checked } entries
type ItemV1 = { id: string; checked: boolean };
type GlobalV1 = { items: ItemV1[] };
type StateV1 = PHBaseState & { global: GlobalV1; local: Record<string, never> };

// V2 state: "checked" field renamed to "done"
type ItemV2 = { id: string; done: boolean };
type GlobalV2 = { items: ItemV2[] };
type StateV2 = PHBaseState & { global: GlobalV2; local: Record<string, never> };

// V1 actions
type AddItemV1Action = Action & { type: "ADD_ITEM_V1"; input: { id: string } };
type CheckItemV1Action = Action & {
  type: "CHECK_ITEM_V1";
  input: { id: string; checked: boolean };
};
type V1Action = AddItemV1Action | CheckItemV1Action;

// V2 actions
type AddItemV2Action = Action & { type: "ADD_ITEM_V2"; input: { id: string } };
type DoneItemV2Action = Action & {
  type: "DONE_ITEM_V2";
  input: { id: string; done: boolean };
};
type V2Action = AddItemV2Action | DoneItemV2Action;

const createStateV1: CreateState<StateV1> = (partial) => ({
  ...defaultBaseState(),
  document: { ...defaultBaseState().document, version: 1 },
  global: { items: [], ...partial?.global },
  local: {},
});

const createStateV2: CreateState<StateV2> = (partial) => ({
  ...defaultBaseState(),
  document: { ...defaultBaseState().document, version: 2 },
  global: { items: [], ...partial?.global },
  local: {},
});

const baseReducerV1: StateReducer<StateV1> = (state, action) => {
  switch (action.type) {
    case "ADD_ITEM_V1":
      state.global.items.push({
        id: (action.input as { id: string }).id,
        checked: false,
      });
      break;
    case "CHECK_ITEM_V1": {
      const inp = action.input as { id: string; checked: boolean };
      const item = state.global.items.find((i) => i.id === inp.id);
      if (item) item.checked = inp.checked;
      break;
    }
    default:
      break;
  }
  return undefined;
};

const baseReducerV2: StateReducer<StateV2> = (state, action) => {
  switch (action.type) {
    case "ADD_ITEM_V2":
      state.global.items.push({
        id: (action.input as { id: string }).id,
        done: false,
      });
      break;
    case "DONE_ITEM_V2": {
      const inp = action.input as { id: string; done: boolean };
      const item = state.global.items.find((i) => i.id === inp.id);
      if (item) item.done = inp.done;
      break;
    }
    // V2 reducer has NO legacy CHECK_ITEM_V1 case — this is intentional
    default:
      break;
  }
  return undefined;
};

// Upgrade reducer: transforms StateV1 → StateV2 (rename checked→done)
function upgradeV1ToV2(
  doc: PHDocument<StateV1>,
  _action: Action,
): PHDocument<StateV2> {
  const v1Items = doc.state.global.items;
  const v2Items: ItemV2[] = v1Items.map((it) => ({
    id: it.id,
    done: it.checked,
  }));
  const newState: StateV2 = {
    ...doc.state,
    global: { items: v2Items },
    local: {},
  };
  return {
    ...doc,
    state: newState,
    initialState: newState,
  } as unknown as PHDocument<StateV2>;
}

const upgradeTransitionV2: UpgradeTransition = {
  toVersion: 2,
  upgradeReducer: upgradeV1ToV2,
  description: "Rename checked→done",
};

const upgradeManifestV1V2: UpgradeManifest<readonly [1, 2]> = {
  documentType: "test/item-model",
  latestVersion: 2,
  supportedVersions: [1, 2] as const,
  upgrades: {
    v2: upgradeTransitionV2,
  },
};

const reducerV1 = createReducer<StateV1>(baseReducerV1);
const reducerV2 = createReducer<StateV2>(baseReducerV2);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTimestamp(offsetMs: number): string {
  return new Date(1700000000000 + offsetMs).toISOString();
}

function addItemV1(id: string, ts?: string): AddItemV1Action {
  return {
    id: randomUUID(),
    type: "ADD_ITEM_V1",
    scope: "global",
    timestampUtcMs: ts ?? new Date().toISOString(),
    input: { id },
  };
}

function checkItemV1(
  id: string,
  checked: boolean,
  ts?: string,
): CheckItemV1Action {
  return {
    id: randomUUID(),
    type: "CHECK_ITEM_V1",
    scope: "global",
    timestampUtcMs: ts ?? new Date().toISOString(),
    input: { id, checked },
  };
}

function addItemV2(id: string, ts?: string): AddItemV2Action {
  return {
    id: randomUUID(),
    type: "ADD_ITEM_V2",
    scope: "global",
    timestampUtcMs: ts ?? new Date().toISOString(),
    input: { id },
  };
}

function doneItemV2(id: string, done: boolean, ts?: string): DoneItemV2Action {
  return {
    id: randomUUID(),
    type: "DONE_ITEM_V2",
    scope: "global",
    timestampUtcMs: ts ?? new Date().toISOString(),
    input: { id, done },
  };
}

/**
 * Builds a mixed v1/v2 document history programmatically.
 *
 * 1. Creates a v1 document
 * 2. Applies v1 operations
 * 3. Applies UPGRADE_DOCUMENT (v1→v2) with optional revision stamp
 * 4. Applies v2 operations
 *
 * Returns the live document for state comparison, and the zip data.
 */
async function buildMixedHistory(opts: {
  stampRevision: boolean;
  upgradeTimestamp?: string;
}): Promise<{ liveDoc: PHDocument<StateV2>; zipData: Uint8Array }> {
  const docType = "test/item-model";
  const ts0 = makeTimestamp(0);
  const ts1 = makeTimestamp(100);
  const ts2 = makeTimestamp(200);
  const tsUpgrade = opts.upgradeTimestamp ?? makeTimestamp(300);
  const ts3 = makeTimestamp(400);
  const ts4 = makeTimestamp(500);

  // Start with v1 document
  let doc = baseCreateDocument<StateV1>(createStateV1, undefined, docType);

  // Apply v1 ops
  doc = reducerV1(doc, addItemV1("item-a", ts0));
  doc = reducerV1(doc, addItemV1("item-b", ts1));
  doc = reducerV1(doc, checkItemV1("item-a", true, ts2));

  // Revision snapshot at upgrade time
  const revisionSnapshot: Record<string, number> = {};
  if (opts.stampRevision) {
    for (const scope of Object.keys(doc.operations)) {
      const ops = doc.operations[scope] ?? [];
      const lastOp = ops.at(-1);
      revisionSnapshot[scope] = lastOp !== undefined ? lastOp.index + 1 : 0;
    }
  }

  // Build upgrade operation
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

  // Apply upgrade transitions to get live v2 doc
  const transitions = computeUpgradeTransitions(upgradeManifestV1V2, 1, 2);
  let doc2 = applyUpgradeDocumentAction(
    doc,
    upgradeAction,
    transitions,
  ) as PHDocument<StateV2>;

  // Add upgrade to document scope operations
  const docScopeOps = doc2.operations["document"] ?? [];
  const upgradeIndex =
    docScopeOps.length > 0 ? (docScopeOps.at(-1)?.index ?? -1) + 1 : 0;
  const upgradeOp: Operation = {
    id: randomUUID(),
    index: upgradeIndex,
    skip: 0,
    timestampUtcMs: tsUpgrade,
    hash: "",
    action: upgradeAction,
  };
  doc2 = {
    ...doc2,
    operations: {
      ...doc2.operations,
      document: [...docScopeOps, upgradeOp],
    },
  };

  // Apply v2 ops
  doc2 = reducerV2(doc2, addItemV2("item-c", ts3));
  doc2 = reducerV2(doc2, doneItemV2("item-c", true, ts4));

  const zipData = await createZip(doc2);
  return { liveDoc: doc2, zipData };
}

// ---------------------------------------------------------------------------
// Test matrix
// ---------------------------------------------------------------------------

describe("versioned replay", () => {
  // 1. Rename migration (v1 CHECK_ITEM removed in v2) with revision stamp
  it("1. rename migration with revision stamp — state deep-equals live doc", async () => {
    const { liveDoc, zipData } = await buildMixedHistory({
      stampRevision: true,
    });

    const loaded = await baseLoadFromInputVersioned<StateV2>(zipData, {
      reducers: { 1: r(reducerV1), 2: r(reducerV2) },
      upgradeManifest: upgradeManifestV1V2,
    });

    expect(loaded.state.global.items).toEqual(liveDoc.state.global.items);
    expect(loaded.initialState.global.items).toEqual(
      liveDoc.initialState.global.items,
    );
    // Every domain scope's last operation hash should match recomputed hash
    for (const scope of ["global"]) {
      const ops = loaded.operations[scope] ?? [];
      const lastOp = ops.at(-1);
      if (lastOp) {
        const recomputedHash = hashDocumentStateForScope(loaded, scope);
        expect(lastOp.hash).toBe(recomputedHash);
      }
    }

    // Also succeeds with checkHashes: false (the verifying mode)
    const loadedVerify = await baseLoadFromInputVersioned<StateV2>(
      zipData,
      {
        reducers: { 1: r(reducerV1), 2: r(reducerV2) },
        upgradeManifest: upgradeManifestV1V2,
      },
      { checkHashes: false },
    );
    expect(loadedVerify.state.global.items).toEqual(liveDoc.state.global.items);
  });

  // 2. Same history WITHOUT revision stamps — timestamp fallback produces identical results
  it("2. timestamp fallback produces identical results to revision stamp", async () => {
    // Use strictly increasing timestamps to ensure unambiguous ordering
    const { zipData: zipWithRevision } = await buildMixedHistory({
      stampRevision: true,
    });
    const { zipData: zipNoRevision } = await buildMixedHistory({
      stampRevision: false,
    });

    const loadedWithRevision = await baseLoadFromInputVersioned<StateV2>(
      zipWithRevision,
      {
        reducers: { 1: r(reducerV1), 2: r(reducerV2) },
        upgradeManifest: upgradeManifestV1V2,
      },
    );
    const loadedNoRevision = await baseLoadFromInputVersioned<StateV2>(
      zipNoRevision,
      {
        reducers: { 1: r(reducerV1), 2: r(reducerV2) },
        upgradeManifest: upgradeManifestV1V2,
      },
    );

    expect(loadedNoRevision.state.global.items).toEqual(
      loadedWithRevision.state.global.items,
    );
  });

  // 3. Additive migration loads correctly under both option modes
  it("3. additive migration (new field in v2) loads correctly", async () => {
    // V2 adds a "priority" field to items; v1 items have {id, checked}
    type GlobalV2Additive = { items: Array<{ id: string; priority: number }> };
    type StateV2Additive = PHBaseState & {
      global: GlobalV2Additive;
      local: Record<string, never>;
    };

    const baseReducerV2Additive: StateReducer<StateV2Additive> = (
      state,
      action,
    ) => {
      switch (action.type) {
        case "ADD_ITEM_V2A":
          state.global.items.push({
            id: (action.input as { id: string }).id,
            priority: (action.input as { priority: number }).priority ?? 0,
          });
          break;
        default:
          break;
      }
      return undefined;
    };
    const rv2Additive = createReducer<StateV2Additive>(baseReducerV2Additive);

    const upgradeAdditiveV2: UpgradeTransition = {
      toVersion: 2,
      upgradeReducer: (doc: PHDocument<PHBaseState>) => {
        const castDoc = doc as unknown as PHDocument<StateV1>;
        const items = castDoc.state.global.items.map((it) => ({
          id: it.id,
          priority: it.checked ? 1 : 0,
        }));
        const newState = {
          ...castDoc.state,
          document: { ...castDoc.state.document, version: 2 },
          global: { items },
          local: {},
        } as unknown as StateV2Additive;
        return {
          ...doc,
          state: newState,
          initialState: newState,
        } as PHDocument<PHBaseState>;
      },
    };

    const additiveManifest: UpgradeManifest<readonly [1, 2]> = {
      documentType: "test/additive-model",
      latestVersion: 2,
      supportedVersions: [1, 2] as const,
      upgrades: { v2: upgradeAdditiveV2 },
    };

    const docType = "test/additive-model";
    const ts0 = makeTimestamp(0);
    const tsUpgrade = makeTimestamp(200);
    const ts1 = makeTimestamp(400);

    let doc = baseCreateDocument<StateV1>(createStateV1, undefined, docType);
    doc = reducerV1(doc, addItemV1("x", ts0));
    doc = reducerV1(doc, checkItemV1("x", true, makeTimestamp(100)));

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
      },
    };

    const transitions = computeUpgradeTransitions(additiveManifest, 1, 2);
    let doc2 = applyUpgradeDocumentAction(
      doc,
      upgradeAction,
      transitions,
    ) as PHDocument<StateV2Additive>;

    const docScopeOps = doc2.operations["document"] ?? [];
    const upgradeIndex =
      docScopeOps.length > 0 ? (docScopeOps.at(-1)?.index ?? -1) + 1 : 0;
    const upgradeOp: Operation = {
      id: randomUUID(),
      index: upgradeIndex,
      skip: 0,
      timestampUtcMs: tsUpgrade,
      hash: "",
      action: upgradeAction,
    };
    doc2 = {
      ...doc2,
      operations: {
        ...doc2.operations,
        document: [...docScopeOps, upgradeOp],
      },
    };

    // Add a v2 item using the v2 reducer
    const addV2Action = {
      id: randomUUID(),
      type: "ADD_ITEM_V2A",
      scope: "global",
      timestampUtcMs: ts1,
      input: { id: "y", priority: 5 },
    } as Action;
    doc2 = rv2Additive(doc2, addV2Action) as PHDocument<StateV2Additive>;

    const zipData = await createZip(doc2 as unknown as PHDocument);

    const loaded = await baseLoadFromInputVersioned<StateV2Additive>(zipData, {
      reducers: {
        1: r(reducerV1),
        2: r(rv2Additive),
      },
      upgradeManifest: additiveManifest,
    });

    expect(loaded.state.global.items).toHaveLength(2);
    expect(loaded.state.global.items[0]).toMatchObject({
      id: "x",
      priority: 1,
    });
    expect(loaded.state.global.items[1]).toMatchObject({
      id: "y",
      priority: 5,
    });

    // Also with checkHashes: false
    const loadedVerify = await baseLoadFromInputVersioned<StateV2Additive>(
      zipData,
      {
        reducers: {
          1: r(reducerV1),
          2: r(rv2Additive),
        },
        upgradeManifest: additiveManifest,
      },
      { checkHashes: false },
    );
    expect(loadedVerify.state.global.items).toHaveLength(2);
  });

  // 4. Multi-step v1→v3 (two transitions applied in order)
  it("4. multi-step v1→v3 applies both transitions", async () => {
    type GlobalV3 = {
      entries: Array<{ id: string; completed: boolean; rank: number }>;
    };
    type StateV3 = PHBaseState & {
      global: GlobalV3;
      local: Record<string, never>;
    };

    const docType = "test/multistep-model";
    const ts0 = makeTimestamp(0);
    const tsUpgrade12 = makeTimestamp(200);
    const tsUpgrade23 = makeTimestamp(300);
    const ts1 = makeTimestamp(400);

    let doc = baseCreateDocument<StateV1>(createStateV1, undefined, docType);
    doc = reducerV1(doc, addItemV1("alpha", ts0));
    doc = reducerV1(doc, checkItemV1("alpha", true, makeTimestamp(50)));

    // Build v1→v2 upgrade in document scope
    const upgradeAction12: UpgradeDocumentAction = {
      id: randomUUID(),
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      timestampUtcMs: tsUpgrade12,
      input: {
        model: docType,
        fromVersion: 1,
        toVersion: 2,
        documentId: doc.header.id,
      },
    };
    // Build v2→v3 upgrade in document scope
    const upgradeAction23: UpgradeDocumentAction = {
      id: randomUUID(),
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      timestampUtcMs: tsUpgrade23,
      input: {
        model: docType,
        fromVersion: 2,
        toVersion: 3,
        documentId: doc.header.id,
      },
    };

    // Upgrade reducers
    const upgradeV1V2: UpgradeTransition = {
      toVersion: 2,
      upgradeReducer: (doc2: PHDocument<PHBaseState>) => {
        const castDoc = doc2 as unknown as PHDocument<StateV1>;
        const items = castDoc.state.global.items.map((it) => ({
          id: it.id,
          done: it.checked,
        }));
        const newState = { ...castDoc.state, global: { items }, local: {} };
        return {
          ...doc2,
          state: newState,
          initialState: newState,
        } as PHDocument<PHBaseState>;
      },
    };

    const upgradeV2V3: UpgradeTransition = {
      toVersion: 3,
      upgradeReducer: (doc3: PHDocument<PHBaseState>) => {
        const castDoc = doc3 as unknown as PHDocument<StateV2>;
        const entries = castDoc.state.global.items.map((it, idx) => ({
          id: it.id,
          completed: it.done,
          rank: idx,
        }));
        const newState = {
          ...castDoc.state,
          global: { entries },
          local: {},
        } as unknown as StateV3;
        return {
          ...doc3,
          state: newState,
          initialState: newState,
        } as PHDocument<PHBaseState>;
      },
    };

    const multiManifest: UpgradeManifest<readonly [1, 2, 3]> = {
      documentType: docType,
      latestVersion: 3,
      supportedVersions: [1, 2, 3] as const,
      upgrades: {
        v2: upgradeV1V2,
        v3: upgradeV2V3,
      },
    };

    // Apply upgrades to get live doc
    let liveDoc = applyUpgradeDocumentAction(doc, upgradeAction12, [
      upgradeV1V2,
    ]) as PHDocument<StateV2>;
    liveDoc = applyUpgradeDocumentAction(liveDoc, upgradeAction23, [
      upgradeV2V3,
    ]) as PHDocument<StateV3> as unknown as PHDocument<StateV2>;

    // Append upgrade ops to document scope
    const docOps = liveDoc.operations["document"] ?? [];
    const idx1 = docOps.length > 0 ? (docOps.at(-1)?.index ?? -1) + 1 : 0;
    const upgradeOp12: Operation = {
      id: randomUUID(),
      index: idx1,
      skip: 0,
      timestampUtcMs: tsUpgrade12,
      hash: "",
      action: upgradeAction12,
    };
    const upgradeOp23: Operation = {
      id: randomUUID(),
      index: idx1 + 1,
      skip: 0,
      timestampUtcMs: tsUpgrade23,
      hash: "",
      action: upgradeAction23,
    };
    const liveDocV3 = {
      ...liveDoc,
      operations: {
        ...liveDoc.operations,
        document: [...docOps, upgradeOp12, upgradeOp23],
      },
    } as unknown as PHDocument<StateV3>;

    const baseV2Reducer: StateReducer<StateV2> = (state, _a) => state;
    const baseV3Reducer: StateReducer<StateV3> = (state, action) => {
      if (action.type === "ADD_ENTRY_V3") {
        const inp = action.input as { id: string };
        state.global.entries.push({
          id: inp.id,
          completed: false,
          rank: state.global.entries.length,
        });
      }
      return undefined;
    };
    const rv2 = createReducer<StateV2>(baseV2Reducer);
    const rv3 = createReducer<StateV3>(baseV3Reducer);

    const zipData = await createZip(liveDocV3 as unknown as PHDocument);

    const loaded = await baseLoadFromInputVersioned<StateV3>(zipData, {
      reducers: {
        1: r(reducerV1),
        2: r(rv2),
        3: r(rv3),
      },
      upgradeManifest: multiManifest,
    });

    // Both transitions applied: state has .entries (not .items)
    expect(loaded.state.global.entries).toBeDefined();
    expect(loaded.state.global.entries).toHaveLength(1);
    expect(loaded.state.global.entries[0]).toMatchObject({
      id: "alpha",
      completed: true,
    });
  });

  // 5. Single-version document: baseLoadFromInputVersioned result deep-equals baseLoadFromInput
  it("5. single-version doc — versioned loader equals legacy loader", async () => {
    const docType = "test/singlever-model";
    let doc = baseCreateDocument<StateV1>(createStateV1, undefined, docType);
    doc = reducerV1(doc, addItemV1("solo-a", makeTimestamp(0)));
    doc = reducerV1(doc, addItemV1("solo-b", makeTimestamp(100)));

    const zipData = await createZip(doc);

    const legacy = await baseLoadFromInput<StateV1>(zipData, reducerV1);
    const versioned = await baseLoadFromInputVersioned<StateV1>(zipData, {
      reducers: { 1: r(reducerV1) },
      upgradeManifest: undefined,
    });

    expect(versioned.state).toEqual(legacy.state);
    expect(versioned.initialState).toEqual(legacy.initialState);
    expect(versioned.header).toEqual(legacy.header);
    expect(versioned.operations).toEqual(legacy.operations);
  });

  // 6. Zip with NO document scope (legacy): versioned loader deep-equals legacy loader
  it("6. zip without document scope — versioned equals legacy", async () => {
    // Create a document without a documentType so createDocumentScopeOperations is NOT called
    const docType = "";

    // Build a fake document with no document scope
    let doc = baseCreateDocument<StateV1>(createStateV1, undefined, docType);
    doc = reducerV1(doc, addItemV1("no-scope-a", makeTimestamp(0)));

    // Remove the document scope if it exists
    const ops = { ...doc.operations };
    delete ops["document"];
    doc = { ...doc, operations: ops };

    const zipData = await createZip(doc);

    const legacy = await baseLoadFromInput<StateV1>(zipData, reducerV1);
    const versioned = await baseLoadFromInputVersioned<StateV1>(zipData, {
      reducers: { 1: r(reducerV1) },
    });

    expect(versioned.state).toEqual(legacy.state);
    expect(versioned.initialState).toEqual(legacy.initialState);
    expect(versioned.header).toEqual(legacy.header);
    expect(versioned.operations).toEqual(legacy.operations);
  });

  // 7. Missing reducer for a recorded version → throws Error naming the version
  it("7. missing reducer throws Error naming the missing version", async () => {
    const { zipData } = await buildMixedHistory({ stampRevision: true });

    // Provide only v2 reducer — v1 is missing
    await expect(
      baseLoadFromInputVersioned<StateV2>(zipData, {
        reducers: { 2: r(reducerV2) },
        upgradeManifest: upgradeManifestV1V2,
      }),
    ).rejects.toThrow("1");
  });

  // 8. Cross-version history with manifest missing the step → throws descriptive Error
  it("8. missing manifest step throws descriptive Error", async () => {
    const { zipData } = await buildMixedHistory({ stampRevision: true });

    // Provide a manifest with no v2 upgrade entry
    const brokenManifest = {
      documentType: "test/item-model",
      latestVersion: 2,
      supportedVersions: [1, 2] as const,
      upgrades: {},
    } as unknown as UpgradeManifest<readonly [1, 2]>;

    await expect(
      baseLoadFromInputVersioned<StateV2>(zipData, {
        reducers: { 1: r(reducerV1), 2: r(reducerV2) },
        upgradeManifest: brokenManifest,
      }),
    ).rejects.toThrow(/v2|step|missing/i);
  });

  // 9. Broken transition (produces different state) + {checkHashes: false} → HashMismatchError
  it("9. broken transition causes HashMismatchError with checkHashes:false", async () => {
    const docType = "test/broken-transition-model";
    const ts0 = makeTimestamp(0);
    const tsUpgrade = makeTimestamp(200);
    const ts1 = makeTimestamp(400);

    let doc = baseCreateDocument<StateV1>(createStateV1, undefined, docType);
    doc = reducerV1(doc, addItemV1("item-x", ts0));

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
      },
    };

    // Correct transition used to build the zip (produces hashes based on correct state)
    const correctTransition: UpgradeTransition = {
      toVersion: 2,
      upgradeReducer: (d: PHDocument<PHBaseState>) => {
        const castDoc = d as unknown as PHDocument<StateV1>;
        const newState: StateV2 = {
          ...castDoc.state,
          global: {
            items: castDoc.state.global.items.map((it) => ({
              id: it.id,
              done: it.checked,
            })),
          },
          local: {},
        };
        return {
          ...d,
          state: newState,
          initialState: newState,
        } as PHDocument<PHBaseState>;
      },
    };

    // Broken transition used at LOAD TIME — produces different state (wrong field values)
    // This simulates a corrupted/incorrect upgrade path that diverges from recorded hashes
    const brokenLoadTransition: UpgradeTransition = {
      toVersion: 2,
      upgradeReducer: (d: PHDocument<PHBaseState>) => {
        const castDoc = d as unknown as PHDocument<StateV1>;
        // Wrong: sets done=true for all items regardless of checked value
        const newState: StateV2 = {
          ...castDoc.state,
          global: {
            items: castDoc.state.global.items.map((it) => ({
              id: it.id,
              done: true, // always true — breaks hash
            })),
          },
          local: {},
        };
        return {
          ...d,
          state: newState,
          initialState: newState,
        } as PHDocument<PHBaseState>;
      },
    };

    const brokenManifest: UpgradeManifest<readonly [1, 2]> = {
      documentType: docType,
      latestVersion: 2,
      supportedVersions: [1, 2] as const,
      upgrades: { v2: brokenLoadTransition },
    };

    // Build zip with the CORRECT transition so recorded hashes match correct state
    const transitions = [correctTransition];
    let doc2 = applyUpgradeDocumentAction(
      doc,
      upgradeAction,
      transitions,
    ) as PHDocument<StateV2>;

    const docScopeOps = doc2.operations["document"] ?? [];
    const upgradeIndex =
      docScopeOps.length > 0 ? (docScopeOps.at(-1)?.index ?? -1) + 1 : 0;
    const upgradeOp: Operation = {
      id: randomUUID(),
      index: upgradeIndex,
      skip: 0,
      timestampUtcMs: tsUpgrade,
      hash: "",
      action: upgradeAction,
    };
    doc2 = {
      ...doc2,
      operations: {
        ...doc2.operations,
        document: [...docScopeOps, upgradeOp],
      },
    };

    doc2 = reducerV2(doc2, addItemV2("item-y", ts1));

    const zipData = await createZip(doc2 as unknown as PHDocument);

    // Loading with the BROKEN transition diverges from recorded state → HashMismatchError
    await expect(
      baseLoadFromInputVersioned<StateV2>(
        zipData,
        {
          reducers: {
            1: r(reducerV1),
            2: r(reducerV2),
          },
          upgradeManifest: brokenManifest,
        },
        { checkHashes: false },
      ),
    ).rejects.toThrow(/hash|mismatch/i);
  });

  // 10. DELETE_DOCUMENT in spine → state.document.isDeleted === true after load
  it("10. DELETE_DOCUMENT in spine marks document as deleted", async () => {
    const docType = "test/delete-model";
    const ts0 = makeTimestamp(0);
    const tsDelete = makeTimestamp(200);

    let doc = baseCreateDocument<StateV1>(createStateV1, undefined, docType);
    doc = reducerV1(doc, addItemV1("keep-this", ts0));

    // Add DELETE_DOCUMENT to document scope
    const deleteAction = {
      id: randomUUID(),
      type: "DELETE_DOCUMENT",
      scope: "document",
      timestampUtcMs: tsDelete,
      input: { documentId: doc.header.id },
    };
    const docScopeOps = doc.operations["document"] ?? [];
    const delIndex =
      docScopeOps.length > 0 ? (docScopeOps.at(-1)?.index ?? -1) + 1 : 0;
    const deleteOp: Operation = {
      id: randomUUID(),
      index: delIndex,
      skip: 0,
      timestampUtcMs: tsDelete,
      hash: "",
      action: deleteAction,
    };
    doc = {
      ...doc,
      operations: {
        ...doc.operations,
        document: [...docScopeOps, deleteOp],
      },
    };

    // Also apply delete to state
    applyDeleteDocumentAction(doc, deleteAction as never);

    const zipData = await createZip(doc);

    const loaded = await baseLoadFromInputVersioned<StateV1>(zipData, {
      reducers: { 1: r(reducerV1) },
    });

    expect(loaded.state.document.isDeleted).toBe(true);
  });

  // 11. Port 5 applyUpgradeDocumentAction unit cases (spec item 11)
  describe("11. applyUpgradeDocumentAction unit cases (shared)", () => {
    it("should merge initialState with existing document state (initial upgrade)", () => {
      const doc = baseCreateDocument<StateV1>(
        createStateV1,
        undefined,
        "test/model",
      );
      const upgradeAction: UpgradeDocumentAction = {
        id: "upgrade-1",
        type: "UPGRADE_DOCUMENT",
        scope: "document",
        timestampUtcMs: "2024-01-01T00:00:01.000Z",
        input: {
          documentId: doc.header.id,
          model: "test/model",
          fromVersion: 0,
          toVersion: 1,
          initialState: {
            ...defaultBaseState(),
            global: { items: [{ id: "seeded", checked: false }] },
            local: {},
          } as StateV1,
        },
      };

      const result = applyUpgradeDocumentAction(doc, upgradeAction);
      const castResult = result as PHDocument<StateV1>;
      expect(castResult.state.global.items).toEqual([
        { id: "seeded", checked: false },
      ]);
      expect(result.initialState).toEqual(result.state);
      expect(result.state.document.version).toBe(1);
    });

    it("should handle state field instead of initialState", () => {
      const doc = baseCreateDocument<StateV1>(
        createStateV1,
        undefined,
        "test/model",
      );
      const upgradeAction = {
        id: "upgrade-1",
        type: "UPGRADE_DOCUMENT",
        scope: "document",
        timestampUtcMs: "2024-01-01T00:00:01.000Z",
        input: {
          documentId: doc.header.id,
          model: "test/model",
          fromVersion: 0,
          toVersion: 1,
          state: {
            ...defaultBaseState(),
            global: { items: [{ id: "from-state-field", checked: true }] },
            local: {},
          },
        },
      } as unknown as UpgradeDocumentAction;

      const result = applyUpgradeDocumentAction(doc, upgradeAction);
      const castResult = result as PHDocument<StateV1>;
      expect(castResult.state.global.items[0]?.id).toBe("from-state-field");
      expect(result.state.document.version).toBe(1);
    });

    it("should preserve existing state when no initialState or state provided", () => {
      let doc = baseCreateDocument<StateV1>(
        createStateV1,
        undefined,
        "test/model",
      );
      doc = reducerV1(doc, addItemV1("existing"));
      const originalCount = (doc.state as StateV1).global.items.length;

      const upgradeAction: UpgradeDocumentAction = {
        id: "upgrade-1",
        type: "UPGRADE_DOCUMENT",
        scope: "document",
        timestampUtcMs: "2024-01-01T00:00:01.000Z",
        input: {
          documentId: doc.header.id,
          model: "test/model",
          fromVersion: 0,
          toVersion: 1,
        },
      };

      const result = applyUpgradeDocumentAction(doc, upgradeAction);
      expect(result.state.document.version).toBe(1);
      expect((result.state as StateV1).global.items).toHaveLength(
        originalCount,
      );
    });

    it("should return unchanged document for same version (no-op)", () => {
      const doc = baseCreateDocument<StateV1>(
        createStateV1,
        undefined,
        "test/model",
      );
      doc.state.document.version = 1;

      const upgradeAction: UpgradeDocumentAction = {
        id: "upgrade-1",
        type: "UPGRADE_DOCUMENT",
        scope: "document",
        timestampUtcMs: "2024-01-01T00:00:01.000Z",
        input: {
          documentId: doc.header.id,
          model: "test/model",
          fromVersion: 1,
          toVersion: 1,
        },
      };

      const result = applyUpgradeDocumentAction(doc, upgradeAction);
      expect(result).toBe(doc);
      expect(result.state.document.version).toBe(1);
    });

    it("should throw DowngradeNotSupportedError for downgrade attempt", () => {
      const doc = baseCreateDocument<StateV1>(
        createStateV1,
        undefined,
        "test/model",
      );
      doc.state.document.version = 2;

      const upgradeAction: UpgradeDocumentAction = {
        id: "upgrade-1",
        type: "UPGRADE_DOCUMENT",
        scope: "document",
        timestampUtcMs: "2024-01-01T00:00:01.000Z",
        input: {
          documentId: doc.header.id,
          model: "test/model",
          fromVersion: 2,
          toVersion: 1,
        },
      };

      expect(() => applyUpgradeDocumentAction(doc, upgradeAction)).toThrow(
        DowngradeNotSupportedError,
      );
    });
  });
});
