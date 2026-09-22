import { mkdirSync, writeFileSync } from "node:fs";
import {
  AddFileInputSchema,
  AddFolderInputSchema,
  assignNodes,
  defaultGlobalState,
  driveDocumentModelModule,
  handleTargetNameCollisions,
  insertNodeSorted,
  isFileNode,
  isValidName,
  nodeReducer,
  readNodes,
  sortNodesById,
  type AddFileAction,
  type AddFolderAction,
  type DocumentDriveGlobalState,
  type DocumentDrivePHState,
  type FileNode,
  type Node as DriveNode,
} from "@powerhousedao/shared/document-drive";
import {
  createReducer,
  deriveOperationId,
  generateId,
  isDocumentAction,
  type Action,
  type DocumentModelModule,
  type Operation,
  type PHDocument,
  type Reducer,
  type SignalDispatch,
  type StateReducer,
} from "@powerhousedao/shared/document-model";
import type { Options as BenchOptions } from "tinybench";
import { bench, describe } from "vitest";
import { KyselyWriteCache } from "../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../src/cache/write-cache-types.js";
import { SnapshotPosition } from "../src/cache/write-cache-types.js";
import { DocumentModelRegistry } from "../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../src/registry/interfaces.js";
import type {
  IKeyframeStore,
  IOperationStore,
} from "../src/storage/interfaces.js";
import { createTestOperationStore } from "../test/factories.js";

const DOCUMENT_ID = "bench-doc-1";
const DOCUMENT_TYPE = "powerhouse/document-drive";
const SCOPE = "global";
const BRANCH = "main";

/**
 * Keyframe minting off. Every case that builds a cache inside the measured
 * function uses this: a keyframe written by one iteration would still be in
 * the shared store on the next, so iteration 500 would rebuild from a
 * keyframe iteration 1 rebuilt from scratch. The only cases that mint
 * keyframes are the two that exist to price minting them.
 */
const NO_KEYFRAMES: WriteCacheConfig = {
  maxDocuments: 100,
  ringBufferSize: 10,
  keyframeInterval: 1_000_000,
};

type Fixture = {
  store: IOperationStore;
  keyframeStore: IKeyframeStore;
  registry: IDocumentModelRegistry;
  destroy: () => Promise<void>;
};

/**
 * tinybench does not await teardown, so the destroy it starts is chained here
 * and awaited by the next fixture instead. Without that, a PGlite instance
 * would be torn down while the following task is booting its own.
 */
let pendingTeardown: Promise<void> = Promise.resolve();

async function createFixture(
  module: DocumentModelModule<DocumentDrivePHState> = driveDocumentModelModule,
): Promise<Fixture> {
  await pendingTeardown;

  const { db, store, keyframeStore, cleanup } =
    await createTestOperationStore();

  const registry = new DocumentModelRegistry();
  registry.registerModules(module);

  const destroy = async (): Promise<void> => {
    try {
      await db.destroy();
    } catch (error) {
      console.error("bench fixture: db.destroy failed", error);
    }

    try {
      await cleanup();
    } catch (error) {
      console.error("bench fixture: cleanup failed", error);
    }
  };

  return { store, keyframeStore, registry, destroy };
}

/**
 * Declares a bench case that boots its PGlite fixture once per phase.
 *
 * tinybench calls setup and teardown once before and once after each of the
 * warmup and run loops, never per iteration, and vitest constructs the Task
 * without FnOptions, so beforeEach/afterEach are unreachable. Anything the
 * measured function needs per iteration therefore has to be cheap enough to
 * pay for on every sample; everything else belongs in prepare.
 *
 * `throws` makes tinybench rethrow a failing task instead of parking the
 * error on result.error, dispatching no event and reporting a passing suite.
 */
type BenchCaseOptions = {
  /**
   * A floor on samples, for cases whose iteration is slower than `time`.
   * tinybench defaults it to 10, so only a larger value changes anything.
   */
  iterations?: number;
  /** The module the case's registry holds, when it must not be the plain one. */
  module?: DocumentModelModule<DocumentDrivePHState>;
  /**
   * Turns on the in-situ replay stamps for this case: the accumulators are
   * cleared once prepare has finished, so nothing prepare replays is counted,
   * and the run phase files its decomposition under this label, both to the
   * sidecar the recorder reads and to stdout.
   */
  stamps?: string;
};

function benchCase<TState>(
  name: string,
  time: number,
  prepare: (fixture: Fixture) => Promise<TState>,
  measure: (state: TState) => Promise<void>,
  caseOptions: BenchCaseOptions = {},
): void {
  let fixture: Fixture | undefined = undefined;
  let state: TState | undefined = undefined;

  const options: BenchOptions = {
    time,
    iterations: caseOptions.iterations,
    throws: true,
    setup: async () => {
      fixture = await createFixture(caseOptions.module);
      state = await prepare(fixture);

      if (caseOptions.stamps !== undefined) {
        resetReplayStamps();
      }
    },
    teardown: (_task, mode) => {
      const finished = fixture;
      fixture = undefined;
      state = undefined;

      if (caseOptions.stamps !== undefined && mode === "run") {
        recordReplayStamps(caseOptions.stamps);
      }

      if (finished) {
        pendingTeardown = finished.destroy();
      }
    },
  };

  bench(
    name,
    async () => {
      await measure(state!);
    },
    options,
  );
}

async function freshCache(
  fixture: Fixture,
  config: WriteCacheConfig,
): Promise<KyselyWriteCache> {
  const cache = new KyselyWriteCache(
    fixture.keyframeStore,
    fixture.store,
    fixture.registry,
    config,
  );
  await cache.startup();
  return cache;
}

async function createDocumentInStore(
  store: IOperationStore,
  documentId: string,
): Promise<void> {
  const initialState = driveDocumentModelModule.utils.createState();

  const createActionId = generateId();
  const upgradeActionId = generateId();

  await store.apply(documentId, DOCUMENT_TYPE, "document", BRANCH, 0, (txn) => {
    txn.addOperations({
      id: deriveOperationId(documentId, "document", BRANCH, createActionId),
      index: 0,
      skip: 0,
      hash: `${documentId}-hash-doc-0`,
      timestampUtcMs: new Date().toISOString(),
      action: {
        id: createActionId,
        type: "CREATE_DOCUMENT",
        scope: "document",
        timestampUtcMs: Date.now().toString(),
        input: {
          documentId,
          model: DOCUMENT_TYPE,
          version: 0,
          protocolVersions: { "base-reducer": 2 },
        },
      },
    });

    txn.addOperations({
      id: deriveOperationId(documentId, "document", BRANCH, upgradeActionId),
      index: 1,
      skip: 0,
      hash: `${documentId}-hash-doc-1`,
      timestampUtcMs: new Date().toISOString(),
      action: {
        id: upgradeActionId,
        type: "UPGRADE_DOCUMENT",
        scope: "document",
        timestampUtcMs: Date.now().toString(),
        input: {
          documentId,
          model: DOCUMENT_TYPE,
          fromVersion: 0,
          toVersion: 1,
          initialState,
        },
      },
    });
  });
}

/**
 * The action stored at `index` by `appendOperations`. Extracted so a case that
 * replays without a store replays the same actions a stored replay reads back.
 */
function syntheticAction(
  documentId: string,
  index: number,
): AddFileAction | AddFolderAction {
  const isFile = index % 2 === 1;

  if (isFile) {
    return {
      id: `${documentId}-action-${index}`,
      type: "ADD_FILE",
      scope: SCOPE,
      timestampUtcMs: Date.now().toString(),
      input: {
        id: `${documentId}-file-${index}`,
        name: `file-${index}.txt`,
        documentType: "powerhouse/document-model",
        parentFolder: null,
      },
    };
  }

  return {
    id: `${documentId}-action-${index}`,
    type: "ADD_FOLDER",
    scope: SCOPE,
    timestampUtcMs: Date.now().toString(),
    input: {
      id: `${documentId}-folder-${index}`,
      name: `Folder ${index}`,
      parentFolder: null,
    },
  };
}

/** Appends `count` global-scope operations at contiguous indices 0..count-1. */
async function appendOperations(
  store: IOperationStore,
  documentId: string,
  count: number,
): Promise<void> {
  for (let index = 0; index < count; index++) {
    await store.apply(
      documentId,
      DOCUMENT_TYPE,
      SCOPE,
      BRANCH,
      index,
      (txn) => {
        txn.addOperations({
          id: `${documentId}-op-${index}`,
          index,
          skip: 0,
          hash: `${documentId}-hash-${index}`,
          timestampUtcMs: new Date().toISOString(),
          action: syntheticAction(documentId, index),
        });
      },
    );
  }
}

/** One document carrying `count` global operations at indices 0..count-1. */
async function populateSingleDocument(
  fixture: Fixture,
  count: number,
): Promise<void> {
  await createDocumentInStore(fixture.store, DOCUMENT_ID);
  await appendOperations(fixture.store, DOCUMENT_ID, count);
}

/** `count` documents, each carrying one global operation at index 0. */
async function populateManyDocuments(
  fixture: Fixture,
  count: number,
): Promise<string[]> {
  const documentIds: string[] = [];

  for (let i = 1; i <= count; i++) {
    const documentId = `doc-${i}`;
    documentIds.push(documentId);
    await createDocumentInStore(fixture.store, documentId);
    await appendOperations(fixture.store, documentId, 1);
  }

  return documentIds;
}

/**
 * Rebuilds a document through a throwaway cache. Used by prepare to hand the
 * measured function a starting snapshot; keyframes stay off so the rebuild
 * leaves nothing behind in the store.
 */
async function documentAtRevision(
  fixture: Fixture,
  documentId: string,
  revision: number,
): Promise<PHDocument> {
  const builder = await freshCache(fixture, NO_KEYFRAMES);
  return builder.getState(documentId, SCOPE, BRANCH, revision);
}

/**
 * Fails the case in setup if the fixture does not hold the history the case
 * name claims. A revision header is a next index, so the document built at
 * last index `lastIndex` reports `lastIndex + 1`.
 */
function assertLastIndex(document: PHDocument, lastIndex: number): PHDocument {
  const revision = document.header.revision[SCOPE];

  if (revision !== lastIndex + 1) {
    throw new Error(
      `bench fixture is wrong: expected ${SCOPE} to end at index ${lastIndex}, got revision ${String(revision)}`,
    );
  }

  return document;
}

describe("Write Cache Cold Miss Performance", () => {
  benchCase(
    "Cold miss rebuild (100 operations)",
    2000,
    async (fixture) => {
      await populateSingleDocument(fixture, 100);
      assertLastIndex(await documentAtRevision(fixture, DOCUMENT_ID, 99), 99);
      return fixture;
    },
    async (fixture) => {
      const cache = await freshCache(fixture, NO_KEYFRAMES);
      await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, 99);
    },
  );

  benchCase(
    "Cold miss rebuild (1000 operations)",
    5000,
    async (fixture) => {
      await populateSingleDocument(fixture, 1000);
      assertLastIndex(await documentAtRevision(fixture, DOCUMENT_ID, 999), 999);
      return fixture;
    },
    async (fixture) => {
      const cache = await freshCache(fixture, NO_KEYFRAMES);
      await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, 999);
    },
  );

  benchCase(
    "Cold miss with keyframe optimization (100 ops, keyframe at 50)",
    2000,
    async (fixture) => {
      await populateSingleDocument(fixture, 100);

      const atFifty = assertLastIndex(
        await documentAtRevision(fixture, DOCUMENT_ID, 50),
        50,
      );

      await fixture.keyframeStore.putKeyframe(DOCUMENT_ID, SCOPE, BRANCH, 50, {
        ...atFifty,
        operations: {},
        clipboard: [],
      });

      const nearest = await fixture.keyframeStore.findNearestKeyframe(
        DOCUMENT_ID,
        SCOPE,
        BRANCH,
        99,
      );

      if (nearest?.revision !== 50) {
        throw new Error(
          `bench fixture is wrong: expected a keyframe at 50, got ${String(nearest?.revision)}`,
        );
      }

      return fixture;
    },
    async (fixture) => {
      const cache = await freshCache(fixture, NO_KEYFRAMES);
      await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, 99);
    },
  );
});

describe("Write Cache Hit Performance", () => {
  benchCase(
    "Cache hit (exact revision match)",
    1000,
    async (fixture) => {
      await populateSingleDocument(fixture, 100);

      const cache = await freshCache(fixture, NO_KEYFRAMES);
      assertLastIndex(await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, 50), 50);

      return cache;
    },
    async (cache) => {
      await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, 50);
    },
  );

  benchCase(
    "Cache hit (latest revision)",
    1000,
    async (fixture) => {
      await populateSingleDocument(fixture, 100);

      const cache = await freshCache(fixture, NO_KEYFRAMES);
      // Seeds the head snapshot the measured hit returns. Asking for the
      // latest revision on a cold cache rebuilds and stores it as the head;
      // asking for revision 99 would store a historical snapshot instead and
      // the first measured call would rebuild rather than hit.
      assertLastIndex(
        await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, undefined),
        99,
      );

      return cache;
    },
    async (cache) => {
      await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, undefined);
    },
  );

  benchCase(
    "Cache hit with multiple revisions in ring buffer",
    1000,
    async (fixture) => {
      await populateSingleDocument(fixture, 100);

      const builder = await freshCache(fixture, NO_KEYFRAMES);
      const snapshots: PHDocument[] = [];
      for (let revision = 90; revision <= 99; revision++) {
        snapshots.push(
          await builder.getState(DOCUMENT_ID, SCOPE, BRANCH, revision),
        );
      }

      // Filled through putState alone so the buffer holds ten distinct
      // revisions. Filling it through getState would push twice per revision
      // and the ten-slot buffer would end up holding only 95..99, which is
      // why this case used to measure a cold miss.
      const cache = await freshCache(fixture, NO_KEYFRAMES);
      for (let revision = 90; revision <= 99; revision++) {
        cache.putState(
          DOCUMENT_ID,
          SCOPE,
          BRANCH,
          revision,
          snapshots[revision - 90],
          SnapshotPosition.Head,
        );
      }

      const stream = cache.getStream(DOCUMENT_ID, SCOPE, BRANCH);
      if (stream?.ringBuffer.length !== 10) {
        throw new Error(
          `bench fixture is wrong: expected 10 buffered revisions, got ${String(stream?.ringBuffer.length)}`,
        );
      }

      return cache;
    },
    async (cache) => {
      await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, 95);
    },
  );
});

type WarmMissState = {
  fixture: Fixture;
  base: PHDocument;
  baseRevision: number;
  targetRevision: number;
};

/**
 * A warm miss needs a cache holding exactly one snapshot below the target, and
 * the rebuild it performs stores the result, so the cache cannot be reused
 * across iterations. Constructing one and seeding it with the prepared
 * snapshot is a handful of object copies, which is the price this case pays
 * on top of the rebuild it measures.
 */
async function measureWarmMiss(state: WarmMissState): Promise<void> {
  const cache = await freshCache(state.fixture, NO_KEYFRAMES);

  cache.putState(
    DOCUMENT_ID,
    SCOPE,
    BRANCH,
    state.baseRevision,
    state.base,
    SnapshotPosition.Head,
  );

  await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, state.targetRevision);
}

describe("Write Cache Warm Miss Performance", () => {
  benchCase(
    "Warm miss rebuild (10 incremental operations)",
    1000,
    async (fixture) => {
      await populateSingleDocument(fixture, 100);
      const base = assertLastIndex(
        await documentAtRevision(fixture, DOCUMENT_ID, 50),
        50,
      );
      return { fixture, base, baseRevision: 50, targetRevision: 60 };
    },
    measureWarmMiss,
  );

  benchCase(
    "Warm miss rebuild (50 incremental operations)",
    1000,
    async (fixture) => {
      await populateSingleDocument(fixture, 200);
      const base = assertLastIndex(
        await documentAtRevision(fixture, DOCUMENT_ID, 50),
        50,
      );
      return { fixture, base, baseRevision: 50, targetRevision: 100 };
    },
    measureWarmMiss,
  );

  benchCase(
    "Warm miss with nearby cached revision",
    1000,
    async (fixture) => {
      await populateSingleDocument(fixture, 100);
      const base = assertLastIndex(
        await documentAtRevision(fixture, DOCUMENT_ID, 90),
        90,
      );
      return { fixture, base, baseRevision: 90, targetRevision: 95 };
    },
    measureWarmMiss,
  );
});

type LruState = {
  fixture: Fixture;
  documentIds: string[];
  config: WriteCacheConfig;
};

describe("Write Cache LRU Eviction Performance", () => {
  benchCase(
    "LRU eviction (filling cache to capacity)",
    2000,
    async (fixture) => {
      const documentIds = await populateManyDocuments(fixture, 15);
      assertLastIndex(await documentAtRevision(fixture, documentIds[0], 0), 0);

      return {
        fixture,
        documentIds,
        config: {
          maxDocuments: 10,
          ringBufferSize: 5,
          keyframeInterval: 1_000_000,
        },
      } satisfies LruState;
    },
    async (state) => {
      const cache = await freshCache(state.fixture, state.config);

      for (const documentId of state.documentIds) {
        const document = await cache.getState(documentId, SCOPE, BRANCH, 0);
        cache.putState(
          documentId,
          SCOPE,
          BRANCH,
          0,
          document,
          SnapshotPosition.Head,
        );
      }
    },
  );

  benchCase(
    "LRU access pattern (updating access order)",
    2000,
    async (fixture) => {
      const documentIds = await populateManyDocuments(fixture, 5);
      assertLastIndex(await documentAtRevision(fixture, documentIds[0], 0), 0);

      return {
        fixture,
        documentIds,
        config: {
          maxDocuments: 5,
          ringBufferSize: 5,
          keyframeInterval: 1_000_000,
        },
      } satisfies LruState;
    },
    async (state) => {
      const cache = await freshCache(state.fixture, state.config);

      for (const documentId of state.documentIds) {
        const document = await cache.getState(documentId, SCOPE, BRANCH, 0);
        cache.putState(
          documentId,
          SCOPE,
          BRANCH,
          0,
          document,
          SnapshotPosition.Head,
        );
      }

      for (const documentId of state.documentIds) {
        await cache.getState(documentId, SCOPE, BRANCH, 0);
      }
    },
  );
});

type BaselineState = {
  fixture: Fixture;
  module: ReturnType<IDocumentModelRegistry["getModule"]>;
};

/**
 * Replays the whole global scope by hand, the way a caller with no cache
 * would. getSince returns operations whose index is strictly greater than the
 * revision passed, so -1 is what reads from the first operation - the same
 * starting point the cache's cold rebuild uses.
 */
async function measureManualRebuild(
  state: BaselineState,
  pageSize: number,
): Promise<void> {
  let document: PHDocument | undefined = undefined;
  let cursor = "0";
  let hasMore = true;

  while (hasMore) {
    const result = await state.fixture.store.getSince(
      DOCUMENT_ID,
      SCOPE,
      BRANCH,
      -1,
      undefined,
      { limit: pageSize, cursor },
      undefined,
    );

    for (const storedOp of result.results) {
      if (document === undefined) {
        document = state.module.utils.createDocument();
      }
      document = state.module.reducer(document, storedOp.action, undefined, {
        replayOptions: { operation: storedOp },
      });
    }

    if (result.nextCursor) {
      cursor = result.nextCursor;
    } else {
      hasMore = false;
    }
  }
}

describe("Write Cache vs No-Cache Baseline", () => {
  benchCase(
    "No-cache baseline: manual rebuild (100 operations)",
    2000,
    async (fixture) => {
      await populateSingleDocument(fixture, 100);
      assertLastIndex(await documentAtRevision(fixture, DOCUMENT_ID, 99), 99);
      return {
        fixture,
        module: fixture.registry.getModule(DOCUMENT_TYPE),
      } satisfies BaselineState;
    },
    async (state) => {
      await measureManualRebuild(state, 100);
    },
  );

  benchCase(
    "With cache: rebuild (100 operations)",
    2000,
    async (fixture) => {
      await populateSingleDocument(fixture, 100);
      assertLastIndex(await documentAtRevision(fixture, DOCUMENT_ID, 99), 99);
      return fixture;
    },
    async (fixture) => {
      const cache = await freshCache(fixture, NO_KEYFRAMES);
      await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, 99);
    },
  );

  benchCase(
    "No-cache baseline: manual rebuild (1000 operations)",
    5000,
    async (fixture) => {
      await populateSingleDocument(fixture, 1000);
      assertLastIndex(await documentAtRevision(fixture, DOCUMENT_ID, 999), 999);
      return {
        fixture,
        module: fixture.registry.getModule(DOCUMENT_TYPE),
      } satisfies BaselineState;
    },
    async (state) => {
      await measureManualRebuild(state, 100);
    },
  );

  benchCase(
    "With cache: rebuild (1000 operations)",
    5000,
    async (fixture) => {
      await populateSingleDocument(fixture, 1000);
      assertLastIndex(await documentAtRevision(fixture, DOCUMENT_ID, 999), 999);
      return fixture;
    },
    async (fixture) => {
      const cache = await freshCache(fixture, NO_KEYFRAMES);
      await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, 999);
    },
  );
});

type KeyframeState = {
  fixture: Fixture;
  config: WriteCacheConfig;
  document: PHDocument;
};

/**
 * Keyframe writes are fire-and-forget, so the case waits for them rather than
 * awaiting them. That wait dominates both of these numbers: the pair is only
 * meaningful as a difference, and even that is mostly hidden by the wait.
 */
async function measureKeyframeWrites(state: KeyframeState): Promise<void> {
  const cache = await freshCache(state.fixture, state.config);

  for (let revision = 1; revision <= 100; revision++) {
    cache.putState(
      DOCUMENT_ID,
      SCOPE,
      BRANCH,
      revision,
      state.document,
      SnapshotPosition.Head,
    );
  }

  await new Promise((resolve) => setTimeout(resolve, 100));
}

describe("Write Cache Keyframe Performance", () => {
  benchCase(
    "Keyframe persistence overhead (every 10th revision)",
    1000,
    async (fixture) => {
      await populateSingleDocument(fixture, 0);

      return {
        fixture,
        config: {
          maxDocuments: 100,
          ringBufferSize: 10,
          keyframeInterval: 10,
        },
        document: driveDocumentModelModule.utils.createDocument(),
      } satisfies KeyframeState;
    },
    measureKeyframeWrites,
  );

  benchCase(
    "Without keyframe persistence (interval = 1000000)",
    1000,
    async (fixture) => {
      await populateSingleDocument(fixture, 0);

      return {
        fixture,
        config: {
          maxDocuments: 100,
          ringBufferSize: 10,
          keyframeInterval: 1_000_000,
        },
        document: driveDocumentModelModule.utils.createDocument(),
      } satisfies KeyframeState;
    },
    measureKeyframeWrites,
  );
});

type ReplayStamps = {
  wallNs: bigint;
  bodyNs: bigint;
  wallCalls: number;
  bodyCalls: number;
};

/**
 * Accumulators for the in-situ decomposition of a cold-miss replay. A tinybench
 * case mean is the wall time of the whole measured function, so a sub-interval
 * of one reducer call cannot be a case of its own; these totals are the only
 * way to separate the custom reducer body, which runs on a mutative draft,
 * from the create() draft and finalize around it. `bodyCalls` is counted
 * separately from `wallCalls` because the two need not be equal.
 */
let replayStamps: ReplayStamps = {
  wallNs: 0n,
  bodyNs: 0n,
  wallCalls: 0,
  bodyCalls: 0,
};

function resetReplayStamps(): void {
  replayStamps = { wallNs: 0n, bodyNs: 0n, wallCalls: 0, bodyCalls: 0 };
}

/**
 * One label's decomposition, in the shape the sidecar carries. A later reader
 * has only the record, so the raw totals and both call counts are stored
 * alongside the per-call figures rather than left to be recovered from them.
 */
type ReplayStampReading = {
  label: string;
  wallCalls: number;
  bodyCalls: number;
  wallMs: number;
  bodyMs: number;
  wallUsPerCall: number;
  bodyUsPerWallCall: number;
  outsideUsPerWallCall: number;
  bodyUsPerBodyCall: number;
  bodySharePct: number;
};

/** Every reading this process has taken, by label. */
const replayReadings = new Map<string, ReplayStampReading>();

/** One leg's split, as per-node slopes over the four op counts. */
type MirrorSplitReading = {
  leg: MirrorLeg;
  counts: number[];
  fullUsPerNode: number;
  collisionScanUsPerNode: number;
  sortUsPerNode: number;
  touchUsPerNode: number;
  floorUsPerNode: number;
  wrapperUsPerNode: number;
  stampedBodyUsPerNode: number;
  realBodyUsPerNode: number;
  collisionScanSharePct: number;
  sortSharePct: number;
  touchSharePct: number;
  floorSharePct: number;
  scanPlusSortSharePct: number;
  mirrorOverRealSlope: number;
};

/** Every split this process has taken, by leg. */
const mirrorSplitReadings = new Map<MirrorLeg, MirrorSplitReading>();

/**
 * Where the recorder reads the decomposition from. `--outputJson` carries case
 * means and nothing else, so a figure that only ever reached stdout is absent
 * from the record that cites it; this file is how the split survives the run.
 */
const REPLAY_STAMPS_FILE = new URL(
  "./results/write-cache-stamps.json",
  import.meta.url,
);

/**
 * Files one label's decomposition and rewrites the sidecar.
 *
 * Body intervals are nested inside wall intervals, so `wallNs - bodyNs` is
 * what the call spent outside the custom reducer and cannot go negative.
 * Dividing that and `bodyNs` by `wallCalls` keeps the three figures additive;
 * a body mean over `bodyCalls` is a different quantity, because the base
 * reducer may invoke the state reducer any number of times per
 * `module.reducer` call - once per op normally, once per replayed operation
 * for an UNDO, and not at all for a scope it handles itself.
 */
function recordReplayStamps(label: string): void {
  const { wallNs, bodyNs, wallCalls, bodyCalls } = replayStamps;

  if (wallCalls === 0 || bodyCalls === 0) {
    console.log(`replay stamps | ${label} | no reducer calls recorded`);
    return;
  }

  const reading: ReplayStampReading = {
    label,
    wallCalls,
    bodyCalls,
    wallMs: Number(wallNs) / 1e6,
    bodyMs: Number(bodyNs) / 1e6,
    wallUsPerCall: Number(wallNs) / 1000 / wallCalls,
    bodyUsPerWallCall: Number(bodyNs) / 1000 / wallCalls,
    outsideUsPerWallCall: Number(wallNs - bodyNs) / 1000 / wallCalls,
    bodyUsPerBodyCall: Number(bodyNs) / 1000 / bodyCalls,
    bodySharePct: (Number(bodyNs) / Number(wallNs)) * 100,
  };

  replayReadings.set(label, reading);
  writeReplayStamps();

  console.log(
    [
      `replay stamps | ${label}`,
      `reducer calls ${wallCalls} (body ${bodyCalls})`,
      `module.reducer wall ${reading.wallUsPerCall.toFixed(3)} us/call`,
      `reducer body in draft ${reading.bodyUsPerWallCall.toFixed(3)} us/call`,
      `create() draft+finalize+base ${reading.outsideUsPerWallCall.toFixed(3)} us/call`,
      `body per state-reducer call ${reading.bodyUsPerBodyCall.toFixed(3)} us`,
      `body share ${reading.bodySharePct.toFixed(1)}%`,
    ].join(" | "),
  );
}

/**
 * A full overwrite of every reading taken so far. The map starts empty on each
 * run, so the file cannot carry a stamp from an earlier one, and writing after
 * every case means a suite that dies partway still leaves what it measured.
 */
function writeReplayStamps(): void {
  const payload = {
    version: 2,
    stamps: [...replayReadings.values()],
    splits: [...mirrorSplitReadings.values()],
  };

  try {
    mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
    writeFileSync(REPLAY_STAMPS_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  } catch (error) {
    // Never fail a measured run over the sidecar. The console line still
    // carries the reading, and a recorder that finds no file refuses loudly.
    console.error("bench: could not write replay stamps", error);
  }
}

/**
 * The input validation the generated reducer runs before it touches state.
 * `AddFileInputSchema()` builds a fresh zod object on every action rather than
 * reusing a cached one - gen/reducer.ts:37 does exactly this - so the cost is
 * per-call in production and not an artifact of the bench. The validation-only
 * leg calls this same function, so the two legs cannot drift apart on the path
 * they share.
 */
const benchSchemaMemo = new Map<() => unknown, unknown>();

/**
 * The generated reducer builds each input schema once and reuses it, so the
 * mirror has to do the same or it prices a construction production no longer
 * pays.
 */
function memoizedSchema<T>(makeSchema: () => T): T {
  let schema = benchSchemaMemo.get(makeSchema) as T | undefined;
  if (schema === undefined) {
    schema = makeSchema();
    benchSchemaMemo.set(makeSchema, schema);
  }
  return schema;
}

function validateDriveInput(action: Action): void {
  if (action.type === "ADD_FILE") {
    memoizedSchema(AddFileInputSchema).parse((action as AddFileAction).input);
    return;
  }

  if (action.type === "ADD_FOLDER") {
    memoizedSchema(AddFolderInputSchema).parse(
      (action as AddFolderAction).input,
    );
  }
}

/**
 * The drive model's own custom reducer body for the two action types this
 * bench replays, reassembled from the exported node reducer and its input
 * schemas because the generated module keeps its state reducer private. It
 * returns undefined for a handled action, as the generated one does, so the
 * base reducer keeps the draft's mutations instead of replacing state.
 */
function applyDriveBody(
  state: DocumentDrivePHState,
  action: Action,
  dispatch?: SignalDispatch,
): DocumentDrivePHState | undefined {
  if (isDocumentAction(action)) {
    return state;
  }

  if (action.type === "ADD_FILE") {
    const fileAction = action as AddFileAction;
    validateDriveInput(fileAction);
    nodeReducer.addFileOperation(state.global, fileAction, dispatch);
    return undefined;
  }

  if (action.type === "ADD_FOLDER") {
    const folderAction = action as AddFolderAction;
    validateDriveInput(folderAction);
    nodeReducer.addFolderOperation(state.global, folderAction, dispatch);
    return undefined;
  }

  return state;
}

const stampedDriveStateReducer: StateReducer<DocumentDrivePHState> = (
  state,
  action,
  dispatch,
) => {
  const startedAt = process.hrtime.bigint();

  try {
    return applyDriveBody(
      state as unknown as DocumentDrivePHState,
      action,
      dispatch,
    );
  } finally {
    replayStamps.bodyNs += process.hrtime.bigint() - startedAt;
    replayStamps.bodyCalls += 1;
  }
};

const stampedDriveReducer = createReducer<DocumentDrivePHState>(
  stampedDriveStateReducer,
);

const instrumentedDriveReducer: Reducer<DocumentDrivePHState> = (
  document,
  action,
  dispatch,
  reducerOptions,
) => {
  const startedAt = process.hrtime.bigint();

  try {
    return stampedDriveReducer(document, action, dispatch, reducerOptions);
  } finally {
    replayStamps.wallNs += process.hrtime.bigint() - startedAt;
    replayStamps.wallCalls += 1;
  }
};

/**
 * The drive module with a timed reducer in place of the generated one. Only the
 * decomposition cases register it, so the six suites above keep measuring the
 * plain module and stay comparable with the recorded series.
 */
const instrumentedDriveModule: DocumentModelModule<DocumentDrivePHState> = {
  ...driveDocumentModelModule,
  reducer: instrumentedDriveReducer,
};

const replayActionCache = new Map<
  number,
  (AddFileAction | AddFolderAction)[]
>();

/** The same actions `appendOperations` stores, built once per op count. */
function replayActions(count: number): (AddFileAction | AddFolderAction)[] {
  const cached = replayActionCache.get(count);

  if (cached) {
    return cached;
  }

  const actions: (AddFileAction | AddFolderAction)[] = [];

  for (let index = 0; index < count; index++) {
    actions.push(syntheticAction(DOCUMENT_ID, index));
  }

  replayActionCache.set(count, actions);
  return actions;
}

/** Op count and the time budget every leg of that count is given. */
const REPLAY_DECOMPOSITION_CASES: [number, number][] = [
  [100, 2000],
  [500, 6000],
  [1000, 8000],
  [2000, 8000],
];

/**
 * A sample floor for the instrumented leg alone, whose iteration at 2000 ops
 * costs about two seconds and would otherwise take the four samples its budget
 * buys. tinybench's own default is 10, so 20 is the first value that does
 * anything; the other legs are cheap enough that the budget already buys them
 * dozens of samples.
 */
const INSTRUMENTED_ITERATIONS = 20;

/**
 * Why a cold-miss rebuild costs about 39x for 10x the operations. Each op count
 * gets a suite of its own, because the recorder derives one spread per suite:
 * holding the count fixed makes that spread a statement about the three
 * mechanisms, where a single suite over every count would pair the largest
 * count's replay against the smallest count's reducer body and call the ratio
 * a decomposition.
 *
 * The three legs nest. A full cold miss through a module whose reducer is
 * timed; the drive reducer body alone on plain state, with no mutative draft
 * and no base reducer; and the input validation that body opens with. The two
 * gaps between them price the draft and the schema separately, and the stamps
 * the first leg files split its own replay from the inside.
 */
for (const [count, budgetMs] of REPLAY_DECOMPOSITION_CASES) {
  describe(`Write Cache Cold Miss Replay Decomposition (${count} ops)`, () => {
    benchCase(
      `cold miss ${count} ops: instrumented cold-miss replay`,
      budgetMs,
      async (fixture) => {
        await populateSingleDocument(fixture, count);
        assertLastIndex(
          await documentAtRevision(fixture, DOCUMENT_ID, count - 1),
          count - 1,
        );
        return fixture;
      },
      async (fixture) => {
        const cache = await freshCache(fixture, NO_KEYFRAMES);
        await cache.getState(DOCUMENT_ID, SCOPE, BRANCH, count - 1);
      },
      {
        iterations: INSTRUMENTED_ITERATIONS,
        module: instrumentedDriveModule,
        stamps: `cold miss ${count} ops`,
      },
    );

    bench(
      `cold miss ${count} ops: reducer body on plain state`,
      () => {
        const state = driveDocumentModelModule.utils.createState({
          global: defaultGlobalState(),
        });
        const actions = replayActions(count);

        for (const action of actions) {
          applyDriveBody(state, action);
        }
      },
      { time: budgetMs, throws: true },
    );

    bench(
      `cold miss ${count} ops: input validation only`,
      () => {
        const actions = replayActions(count);

        for (const action of actions) {
          validateDriveInput(action);
        }
      },
      { time: budgetMs, throws: true },
    );
  });
}

type MirrorVariant = {
  /** The case-name fragment naming which statements the variant runs. */
  label: string;
  /**
   * The two scans over the list the read returned: node.ts:23/59 find and
   * utils.ts:164 collisions, with node.ts:27/63 isValidName between them. The
   * read itself is not under this flag, because the real body reads once at
   * node.ts:22/58 and the assignment at :47/76 consumes what it read, so a
   * variant that skipped it would not be able to write.
   */
  reads: boolean;
  /**
   * The comparator pass inside that one assignment (utils.ts:170
   * insertNodeSorted calling utils.ts:147 freezeSortedById). Dropping it still
   * copies the list, still freezes the copy and still assigns it once, so the
   * difference it makes is the comparator and not the shape of the write.
   */
  sort: boolean;
};

type MirrorSplitStamps = {
  wallNs: bigint;
  readNs: bigint;
  writeNs: bigint;
  bodyNs: bigint;
  calls: number;
};

type MirrorLeg = "draft" | "plain";

type MirrorSample = {
  leg: MirrorLeg;
  label: string;
  count: number;
  stamps: MirrorSplitStamps;
};

type NodeBodyApply = (
  state: DocumentDriveGlobalState,
  action: AddFileAction | AddFolderAction,
) => void;

function createMirrorStamps(): MirrorSplitStamps {
  return { wallNs: 0n, readNs: 0n, writeNs: 0n, bodyNs: 0n, calls: 0 };
}

function resetMirrorStamps(stamps: MirrorSplitStamps): void {
  stamps.wallNs = 0n;
  stamps.readNs = 0n;
  stamps.writeNs = 0n;
  stamps.bodyNs = 0n;
  stamps.calls = 0;
}

function stampStart(stamps: MirrorSplitStamps | undefined): bigint {
  return stamps === undefined ? 0n : process.hrtime.bigint();
}

function addReadStamp(
  stamps: MirrorSplitStamps | undefined,
  startedAt: bigint,
): void {
  if (stamps !== undefined) {
    stamps.readNs += process.hrtime.bigint() - startedAt;
  }
}

function addWriteStamp(
  stamps: MirrorSplitStamps | undefined,
  startedAt: bigint,
): void {
  if (stamps !== undefined) {
    stamps.writeNs += process.hrtime.bigint() - startedAt;
  }
}

/**
 * insertNodeSorted with its comparator pass under the variant. Everything else
 * the real write does is unconditional: the copy the new list is built from,
 * the freeze that keeps assigning it to a mutative draft from starting a
 * finalize walk (utils.ts:147), and the single assignment through assignNodes
 * (utils.ts:187). Only the sort is
 * gone when `sort` is false, so the difference between the two variants is the
 * comparator and nothing else.
 */
function insertNodeForVariant(
  nodes: readonly DriveNode[],
  node: DriveNode,
  sort: boolean,
): readonly DriveNode[] {
  if (sort) {
    return insertNodeSorted(nodes, node);
  }

  return Object.freeze([...nodes, node]);
}

/**
 * A mirror of nodeReducer.addFileOperation and addFolderOperation
 * (packages/shared/document-drive/src/reducers/node.ts:21-82 and the
 * readNodes, handleTargetNameCollisions and insertNodeSorted it calls at
 * src/utils.ts:132, :194, :170 and :187).
 *
 * It is statement-for-statement again, re-derived at reactorSha 88da88929 from
 * the body as T-016, T-020 and T-023 left it: one readNodes(state) call whose
 * result both scans reuse, and one assignNodes(state, insertNodeSorted(nodes,
 * node))
 * that sorts and freezes a plain array. The helpers are the real ones, called
 * here, not copies of them, so the drift T-022 filed -- two state.nodes reads
 * through the draft and an in-place push and sort, which is the pre-T-016
 * shape -- cannot come back by a helper changing underneath this file. What
 * can still drift is the statement order and the gating, so this must be
 * re-checked against node.ts on every future run: the `real body (fidelity
 * reference)` cases in the same suite run the actual reducer through the
 * identical harness, and the mirror's claim to represent it is the ratio
 * between them, which anyone can read off the record rather than take on
 * assertion.
 *
 * It exists only so a variant can drop the read scans or the comparator while
 * running every other statement, which is what splits the per-node tax.
 *
 * Deliberate differences, all of them per-call constants that cancel out of a
 * per-node slope: the real addFileOperation ends in an optional dispatch call,
 * which this harness leaves undefined exactly as the plain-state leg of the
 * decomposition suite above does, and the two hrtime pairs that bracket the
 * read and write intervals are only taken for the variant that carries
 * `stamps`, where the real leg takes one pair for the whole body.
 */
function mirroredNodeBody(
  state: DocumentDriveGlobalState,
  action: AddFileAction | AddFolderAction,
  variant: MirrorVariant,
  stamps: MirrorSplitStamps | undefined,
): void {
  if (action.type === "ADD_FILE") {
    const input = action.input;
    const readStartedAt = stampStart(stamps);
    const nodes = readNodes(state);
    let name = input.name;

    if (variant.reads) {
      if (nodes.find((node) => node.id === input.id)) {
        throw new Error(`Node with id ${input.id} already exists!`);
      }

      if (!isValidName(input.name)) {
        throw new Error(
          `Invalid name: '${input.name}'. Names must not be empty or contain control characters.`,
        );
      }

      name = handleTargetNameCollisions({
        nodes,
        srcName: input.name,
        srcKind: "file",
        targetParentFolder: input.parentFolder || null,
      });
    }

    addReadStamp(stamps, readStartedAt);

    const writeStartedAt = stampStart(stamps);

    const fileNode: FileNode = {
      id: input.id,
      name,
      kind: "file",
      parentFolder: input.parentFolder ?? null,
      documentType: input.documentType,
    };
    assignNodes(state, insertNodeForVariant(nodes, fileNode, variant.sort));

    addWriteStamp(stamps, writeStartedAt);
    return;
  }

  const input = action.input;
  const readStartedAt = stampStart(stamps);
  const nodes = readNodes(state);
  let name = input.name;

  if (variant.reads) {
    if (nodes.find((node) => node.id === input.id)) {
      throw new Error(`Node with id ${input.id} already exists!`);
    }

    if (!isValidName(input.name)) {
      throw new Error(
        `Invalid name: '${input.name}'. Names must not be empty or contain control characters.`,
      );
    }

    name = handleTargetNameCollisions({
      nodes,
      srcName: input.name,
      srcKind: "folder",
      targetParentFolder: input.parentFolder || null,
    });
  }

  addReadStamp(stamps, readStartedAt);

  const writeStartedAt = stampStart(stamps);

  assignNodes(
    state,
    insertNodeForVariant(
      nodes,
      {
        ...input,
        name,
        kind: "folder",
        parentFolder: input.parentFolder ?? null,
      },
      variant.sort,
    ),
  );

  addWriteStamp(stamps, writeStartedAt);
}

/** The real reducer bodies the mirror claims to represent, one whole stamp. */
function stampedRealNodeBody(
  state: DocumentDriveGlobalState,
  action: AddFileAction | AddFolderAction,
  stamps: MirrorSplitStamps,
): void {
  const startedAt = process.hrtime.bigint();

  try {
    if (action.type === "ADD_FILE") {
      nodeReducer.addFileOperation(state, action, undefined);
      return;
    }

    nodeReducer.addFolderOperation(state, action, undefined);
  } finally {
    stamps.bodyNs += process.hrtime.bigint() - startedAt;
  }
}

/**
 * The operations the cold-miss replay feeds the reducer, built once per op
 * count. The leg has to pass them: a replayed operation carrying a hash is the
 * only thing that stops the base reducer hashing the whole scope state on every
 * call (packages/shared/document-model/reducer.ts:639-642), which is O(nodes)
 * and would sit in every variant's mean as a wrapper an order of magnitude
 * larger than the body being split. kysely-write-cache.ts:966 passes exactly
 * `skip`, `replayOptions.operation` and `skipIndexValidation`.
 */
const replayOperationCache = new Map<number, Operation[]>();

function replayStoredOperations(count: number): Operation[] {
  const cached = replayOperationCache.get(count);

  if (cached) {
    return cached;
  }

  const operations: Operation[] = replayActions(count).map((action, index) => ({
    id: deriveOperationId(DOCUMENT_ID, SCOPE, BRANCH, action.id),
    index,
    skip: 0,
    hash: `${DOCUMENT_ID}-hash-${String(index)}`,
    timestampUtcMs: new Date().toISOString(),
    action,
  }));

  replayOperationCache.set(count, operations);
  return operations;
}

/**
 * The draft leg: the same base reducer the cold-miss replay runs, so the state
 * the body mutates is the real nested mutative draft create() builds at
 * packages/shared/document-model/reducer.ts:556. Returning undefined keeps the
 * draft's mutations, as the generated state reducer does.
 */
function mirrorDraftReducer(
  apply: NodeBodyApply,
): Reducer<DocumentDrivePHState> {
  const stateReducer: StateReducer<DocumentDrivePHState> = (state, action) => {
    apply(
      (state as unknown as DocumentDrivePHState).global,
      action as AddFileAction | AddFolderAction,
    );
    return undefined;
  };

  return createReducer<DocumentDrivePHState>(stateReducer);
}

function leastSquaresSlope(xs: number[], ys: number[]): number {
  const n = xs.length;
  const meanX = xs.reduce((total, value) => total + value, 0) / n;
  const meanY = ys.reduce((total, value) => total + value, 0) / n;
  let covariance = 0;
  let variance = 0;

  for (let index = 0; index < n; index++) {
    covariance += (xs[index] - meanX) * (ys[index] - meanY);
    variance += (xs[index] - meanX) ** 2;
  }

  return covariance / variance;
}

/**
 * Per-node cost from the four op counts. A replay of N ops grows the node list
 * from 0 to N-1, so the mean list a call scans is (N-1)/2 long and the per-node
 * cost is twice the slope of per-call time against N -- the method T-016 used
 * for the 0.7402 us/node figure this suite splits.
 */
function perNodeSlope(
  samples: MirrorSample[],
  read: (s: MirrorSample) => number,
): number {
  return (
    2 *
    leastSquaresSlope(
      samples.map((sample) => sample.count),
      samples.map(read),
    )
  );
}

const MIRROR_VARIANTS: MirrorVariant[] = [
  { label: "mirrored body: reads + push + sort", reads: true, sort: true },
  { label: "mirrored body: push + sort, no reads", reads: false, sort: true },
  { label: "mirrored body: reads + push, no sort", reads: true, sort: false },
  { label: "mirrored body: push only", reads: false, sort: false },
];

const MIRROR_FULL_LABEL = MIRROR_VARIANTS[0].label;
const MIRROR_NO_READS_LABEL = MIRROR_VARIANTS[1].label;
const MIRROR_NO_SORT_LABEL = MIRROR_VARIANTS[2].label;
const MIRROR_PUSH_ONLY_LABEL = MIRROR_VARIANTS[3].label;
const MIRROR_REAL_LABEL = "real body (fidelity reference)";
const MIRROR_NO_BODY_LABEL = "no body: create() + base reducer only";

/** Registration order, which the report reads the samples back in. */
const MIRROR_LABELS: string[] = [
  MIRROR_REAL_LABEL,
  MIRROR_NO_BODY_LABEL,
  ...MIRROR_VARIANTS.map((variant) => variant.label),
];

/** Op count and the time budget each split case needs; `iterations` sets n. */
const READ_WRITE_SPLIT_CASES: [number, number][] = [
  [100, 1000],
  [500, 1000],
  [1000, 1000],
  [2000, 1000],
];

const mirrorSamples: MirrorSample[] = [];

function mirrorSampleFor(
  leg: MirrorLeg,
  label: string,
  count: number,
): MirrorSample {
  const sample: MirrorSample = {
    leg,
    label,
    count,
    stamps: createMirrorStamps(),
  };
  mirrorSamples.push(sample);
  return sample;
}

function usPerCall(sample: MirrorSample, ns: bigint): number {
  return sample.stamps.calls === 0
    ? 0
    : Number(ns) / 1000 / sample.stamps.calls;
}

function wallUsPerCall(sample: MirrorSample): number {
  return usPerCall(sample, sample.stamps.wallNs);
}

function legSamples(leg: MirrorLeg, label: string): MirrorSample[] {
  return mirrorSamples.filter(
    (sample) => sample.leg === leg && sample.label === label,
  );
}

function reportMirrorLeg(leg: MirrorLeg): void {
  for (const label of MIRROR_LABELS) {
    const samples = legSamples(leg, label);
    console.log(
      [
        `read/write split | ${leg} | ${label}`,
        ...samples.map(
          (sample) =>
            `${String(sample.count)} ops ${wallUsPerCall(sample).toFixed(3)} us/call`,
        ),
      ].join(" | "),
    );
  }

  const full = legSamples(leg, MIRROR_FULL_LABEL);
  const noReads = legSamples(leg, MIRROR_NO_READS_LABEL);
  const noSort = legSamples(leg, MIRROR_NO_SORT_LABEL);
  const pushOnly = legSamples(leg, MIRROR_PUSH_ONLY_LABEL);
  const noBody = legSamples(leg, MIRROR_NO_BODY_LABEL);
  const real = legSamples(leg, MIRROR_REAL_LABEL);

  const fullSlope = perNodeSlope(full, wallUsPerCall);
  const noReadsSlope = perNodeSlope(noReads, wallUsPerCall);
  const noSortSlope = perNodeSlope(noSort, wallUsPerCall);
  const pushOnlySlope = perNodeSlope(pushOnly, wallUsPerCall);
  const noBodySlope = perNodeSlope(noBody, wallUsPerCall);

  const readScan = fullSlope - noReadsSlope;
  const sortCompare = fullSlope - noSortSlope;
  const touch = noReadsSlope + noSortSlope - pushOnlySlope - fullSlope;
  const readShare = readScan / fullSlope;

  console.log(
    [
      `read/write split | ${leg} | per-node wall slopes`,
      `full ${fullSlope.toFixed(4)}`,
      `no reads ${noReadsSlope.toFixed(4)}`,
      `no sort ${noSortSlope.toFixed(4)}`,
      `push only ${pushOnlySlope.toFixed(4)}`,
      `no body ${noBodySlope.toFixed(4)} us/node`,
    ].join(" | "),
  );
  console.log(
    [
      `read/write split | ${leg} | buckets from the case means, summing to the full wall slope`,
      `read scan ${readScan.toFixed(4)}`,
      `sort comparator ${sortCompare.toFixed(4)}`,
      `touch, being any child drafts and finalize the statements still force ${touch.toFixed(4)}`,
      `the read copy, the insert copy, the freeze, the assignment and everything the wrapper does anyway ${pushOnlySlope.toFixed(4)}`,
      `full wall ${fullSlope.toFixed(4)} us/node`,
      `cross-check read scan with the touch ${(noSortSlope - pushOnlySlope).toFixed(4)}`,
      `cross-check sort with the touch ${(noReadsSlope - pushOnlySlope).toFixed(4)} us/node`,
    ].join(" | "),
  );
  console.log(
    [
      `read/write split | ${leg} | shares of the full per-node wall slope from the case means`,
      `read scan ${(readShare * 100).toFixed(1)}%`,
      `sort comparator ${((sortCompare / fullSlope) * 100).toFixed(1)}%`,
      `touch ${((touch / fullSlope) * 100).toFixed(1)}%`,
      `copies, freeze, assignment and wrapper ${((pushOnlySlope / fullSlope) * 100).toFixed(1)}%`,
      `what survives removing the read scans from the draft ${((noReadsSlope / fullSlope) * 100).toFixed(1)}%`,
      `wrapper the body does not induce, from the no-body case ${noBodySlope.toFixed(4)} us/node`,
    ].join(" | "),
  );

  const stampedRead = perNodeSlope(full, (sample) =>
    usPerCall(sample, sample.stamps.readNs),
  );
  const stampedWrite = perNodeSlope(full, (sample) =>
    usPerCall(sample, sample.stamps.writeNs),
  );
  const stampedBody = stampedRead + stampedWrite;
  const realBody = perNodeSlope(real, (sample) =>
    usPerCall(sample, sample.stamps.bodyNs),
  );

  mirrorSplitReadings.set(leg, {
    leg,
    counts: full.map((sample) => sample.count),
    fullUsPerNode: fullSlope,
    collisionScanUsPerNode: readScan,
    sortUsPerNode: sortCompare,
    touchUsPerNode: touch,
    floorUsPerNode: pushOnlySlope,
    wrapperUsPerNode: noBodySlope,
    stampedBodyUsPerNode: stampedBody,
    realBodyUsPerNode: realBody,
    collisionScanSharePct: readShare * 100,
    sortSharePct: (sortCompare / fullSlope) * 100,
    touchSharePct: (touch / fullSlope) * 100,
    floorSharePct: (pushOnlySlope / fullSlope) * 100,
    scanPlusSortSharePct: ((readScan + sortCompare) / fullSlope) * 100,
    mirrorOverRealSlope: stampedBody / realBody,
  });
  writeReplayStamps();

  console.log(
    [
      `read/write split | ${leg} | stamped body sub-intervals`,
      `reads ${stampedRead.toFixed(4)}`,
      `insert+sort ${stampedWrite.toFixed(4)}`,
      `body total ${stampedBody.toFixed(4)} us/node`,
      `insert+sort share of body ${((stampedWrite / stampedBody) * 100).toFixed(1)}%`,
    ].join(" | "),
  );
  console.log(
    [
      `read/write split | ${leg} | fidelity`,
      `mirror body ${stampedBody.toFixed(4)} us/node`,
      `real body ${realBody.toFixed(4)} us/node`,
      `mirror/real slope ${(stampedBody / realBody).toFixed(4)}x`,
      `wrapper (full wall - mirror body) ${(fullSlope - stampedBody).toFixed(4)} us/node`,
    ].join(" | "),
  );

  for (const sample of full) {
    const reference = real.find((item) => item.count === sample.count);

    if (reference === undefined) {
      continue;
    }

    console.log(
      [
        `read/write split | ${leg} | fidelity per call | ${String(sample.count)} ops`,
        `mirror full wall ${wallUsPerCall(sample).toFixed(3)}`,
        `real body wall ${wallUsPerCall(reference).toFixed(3)} us/call`,
        `ratio ${(wallUsPerCall(sample) / wallUsPerCall(reference)).toFixed(4)}x`,
        `mirror body ${usPerCall(sample, sample.stamps.readNs + sample.stamps.writeNs).toFixed(3)}`,
        `real body ${usPerCall(reference, reference.stamps.bodyNs).toFixed(3)} us/call`,
        `ratio ${(Number(sample.stamps.readNs + sample.stamps.writeNs) / Number(reference.stamps.bodyNs) / (sample.stamps.calls / reference.stamps.calls)).toFixed(4)}x`,
      ].join(" | "),
    );
  }
}

function reportMirrorSplit(): void {
  reportMirrorLeg("draft");
  reportMirrorLeg("plain");
}

/**
 * The `no body` baseline runs the wrapper and nothing else. Its node list stays
 * empty while its operation history grows exactly as every other variant's
 * does, so its slope is the create()/base-reducer cost per replayed operation
 * and subtracting it leaves the reducer body the split is about.
 */
function mirrorApplyFor(
  label: string,
  variant: MirrorVariant | undefined,
  sample: MirrorSample,
): NodeBodyApply {
  if (label === MIRROR_NO_BODY_LABEL) {
    return () => undefined;
  }

  if (variant === undefined) {
    return (state, action) => stampedRealNodeBody(state, action, sample.stamps);
  }

  return (state, action) =>
    mirroredNodeBody(
      state,
      action,
      variant,
      label === MIRROR_FULL_LABEL ? sample.stamps : undefined,
    );
}

function everyMirrorSampleRan(): boolean {
  return mirrorSamples.every((sample) => sample.stamps.calls > 0);
}

/**
 * How the per-node cost of a drive add-node reducer call splits between the
 * read scans at node.ts:23/59 and utils.ts:164 and the single sorted, frozen
 * assignment at node.ts:47/76. A tinybench case mean is the wall time of a
 * whole measured function, so no case can be a sub-interval of one reducer
 * call; instead each leg runs the mirrored body four ways over the same
 * growing node list -- with the scans and the comparator, without the scans,
 * without the comparator, and with neither -- plus a no-body baseline, and the
 * differences between those means carry the split into the record without
 * needing the stamps. Every variant still reads the list and still assigns it
 * with the new node, so the list grows identically and the scan lengths a
 * variant pays are the ones the full body pays.
 *
 * The read the scans share is therefore in every variant, including the ones
 * named `no reads`: what the reads flag drops is the two O(n) scans over the
 * list, not the O(n) copy that produced it. The copy, the second copy the
 * insert makes, the freeze and the assignment all sit in the `push only`
 * floor, which is why that floor is a slope and not a constant. `full - no
 * reads` is the scans, `full - no sort` is the comparator, and what those two
 * leave between the push-only and full means is the touch: the child drafts a
 * statement forces by reaching an element through the draft proxy, and the
 * finalize that unwraps them.
 *
 * That touch term is the reason the two differences were not additive while
 * the body still worked on the draft. On the body as T-016, T-020 and T-023
 * left it, that term should now collapse toward noise on BOTH legs, not only
 * on the plain one: the scans run over a plain copy readNodes took from the base
 * list, the comparator sorts a plain array, and the assignment is frozen, so
 * no statement in the body reaches a node through the proxy. A draft leg that
 * still shows a large touch term, or a draft-over-plain full slope far above
 * 1, means a statement has started touching the draft again -- which is what
 * this suite is now for, rather than the 12.6x tax T-016 measured and removed.
 * The report still prints the split three ways, and the stamped sub-intervals
 * printed alongside charge that residue to the reads, the way the read
 * statements see it in the real body.
 */
describe("Write Cache Cold Miss Replay Read/Write Split", () => {
  for (const leg of ["draft", "plain"] satisfies MirrorLeg[]) {
    for (const label of MIRROR_LABELS) {
      const variant = MIRROR_VARIANTS.find((item) => item.label === label);

      for (const [count, budgetMs] of READ_WRITE_SPLIT_CASES) {
        const sample = mirrorSampleFor(leg, label, count);
        const apply: NodeBodyApply = mirrorApplyFor(label, variant, sample);
        const reducer = leg === "draft" ? mirrorDraftReducer(apply) : undefined;

        bench(
          `${leg} leg ${String(count)} ops: ${label}`,
          () => {
            const operations = replayStoredOperations(count);
            const startedAt = process.hrtime.bigint();

            if (reducer === undefined) {
              const state = driveDocumentModelModule.utils.createState({
                global: defaultGlobalState(),
              });

              for (const operation of operations) {
                apply(
                  state.global,
                  operation.action as AddFileAction | AddFolderAction,
                );
              }
            } else {
              let document = driveDocumentModelModule.utils.createDocument();

              for (const operation of operations) {
                document = reducer(document, operation.action, undefined, {
                  skip: operation.skip,
                  replayOptions: { operation },
                  skipIndexValidation: true,
                });
              }
            }

            sample.stamps.wallNs += process.hrtime.bigint() - startedAt;
            sample.stamps.calls += operations.length;
          },
          {
            time: budgetMs,
            iterations: 10,
            throws: true,
            setup: () => {
              resetMirrorStamps(sample.stamps);
            },
            teardown: (_task, mode) => {
              if (mode === "run" && everyMirrorSampleRan()) {
                reportMirrorSplit();
              }
            },
          },
        );
      }
    }
  }
});

/** A node list at one size in both shapes a reader can hold it: the array sortNodesById froze (packages/shared/document-drive/src/utils.ts:147-158), and a plain copy of the same elements in the same order. */
type NodeListPair = {
  count: number;
  frozen: readonly DriveNode[];
  plain: DriveNode[];
  /** Last in id order, and the folder holding it, so every scan visits all `count` elements. */
  target: FileNode;
  targetParentFolder: string;
};

type NodeListLeg = "frozen" | "plain";

/** One scan the client read path runs, against whichever leg a case holds. */
type NodeScan = {
  suite: string;
  label: string;
  /** Something read off the result, so no case can be optimised away unrun. */
  run: (nodes: readonly DriveNode[], pair: NodeListPair) => number;
};

const NODE_LIST_SIZES: number[] = [100, 1000, 5000];
const NODE_SCAN_TIME_MS = 500;
const NODES_PER_FOLDER = 50;

let nodeScanSink = 0;
let nodeScanCasesRun = 0;

function folderIdFor(index: number): string {
  const folder = Math.floor(index / NODES_PER_FOLDER) * NODES_PER_FOLDER;
  return `node-${String(folder).padStart(6, "0")}`;
}

function buildNodeListPair(count: number): NodeListPair {
  const built: DriveNode[] = [];

  for (let index = 0; index < count; index += 1) {
    const id = `node-${String(index).padStart(6, "0")}`;

    if (index % NODES_PER_FOLDER === 0) {
      built.push({
        id,
        name: `folder ${String(index)}`,
        kind: "folder",
        parentFolder: null,
      });
      continue;
    }

    built.push({
      id,
      name: `document ${String(index)}`,
      kind: "file",
      parentFolder: folderIdFor(index),
      documentType: DOCUMENT_TYPE,
    });
  }

  const frozen = sortNodesById(built);
  const last = frozen[frozen.length - 1];

  if (!isFileNode(last)) {
    throw new Error("the last node in id order has to be a file node");
  }

  return {
    count,
    frozen,
    plain: [...frozen],
    target: last,
    targetParentFolder: folderIdFor(count - 1),
  };
}

/** The scans as their call sites write them: drive-client.ts:235, :365, :396, :449 find by id and :473-477 copies or filters the list; reactor-browser actions/document.ts:74, :873, :912, :966, :1001, :1165, :1180 find by id and :87 finds by name, type and parent folder. The copy is the control -- it reads every element and calls no predicate, which is the shape T-023 measured the freeze leaving alone. */
const NODE_SCANS: NodeScan[] = [
  {
    suite: "Client Node Lookup: find by id",
    label: "find by id",
    run: (nodes, pair) => {
      const node = nodes.find((n) => n.id === pair.target.id);
      return node === undefined ? 0 : node.name.length;
    },
  },
  {
    suite: "Client Node Lookup: find by name, type and parent folder",
    label: "find by name, type and parent folder",
    run: (nodes, pair) => {
      const node = nodes.find(
        (n) =>
          isFileNode(n) &&
          n.name === pair.target.name &&
          n.documentType === pair.target.documentType &&
          n.parentFolder === pair.target.parentFolder,
      );
      return node === undefined ? 0 : node.name.length;
    },
  },
  {
    suite: "Client Node Lookup: filter by parent folder",
    label: "filter by parent folder",
    run: (nodes, pair) =>
      nodes.filter((n) => (n.parentFolder ?? null) === pair.targetParentFolder)
        .length,
  },
  {
    suite: "Client Node Lookup: copy the whole list",
    label: "copy the whole list",
    run: (nodes) => [...nodes].length,
  },
];

const NODE_SCAN_CASES = NODE_SCANS.length * NODE_LIST_SIZES.length * 2;

/** One line saying the scans found what they looked for, so a case that found nothing cannot pass for a fast one. */
function reportNodeScans(): void {
  console.log(
    [
      "client node lookup",
      `${String(nodeScanCasesRun)} cases ran`,
      `scan results summed to ${String(nodeScanSink)}`,
    ].join(" | "),
  );
}

/** What a client node lookup costs now that the list is frozen: the write path reads it through readNodes, which copies it first (utils.ts:132), and the read path scans it in place. A case is one call over one of two lists differing in nothing but Object.freeze, so its mean is the per-lookup wall time and a pair is the multiple the freeze costs; both legs visit every element and the name counts those visits, so the recorder's spread at a size is the freeze and never a difference in list length. The shared sub-microsecond harness floor is a larger share of the 100-node scans than of the 5000-node ones, which makes the smallest size the conservative end. */
for (const scan of NODE_SCANS) {
  describe(scan.suite, () => {
    for (const count of NODE_LIST_SIZES) {
      const pair = buildNodeListPair(count);

      for (const leg of ["frozen", "plain"] satisfies NodeListLeg[]) {
        const nodes: readonly DriveNode[] =
          leg === "frozen" ? pair.frozen : pair.plain;

        bench(
          `${scan.label}, ${leg} list (${String(count)} node ops)`,
          () => {
            nodeScanSink += scan.run(nodes, pair);
          },
          {
            time: NODE_SCAN_TIME_MS,
            throws: true,
            teardown: (_task, mode) => {
              if (mode !== "run") {
                return;
              }

              nodeScanCasesRun += 1;

              if (nodeScanCasesRun === NODE_SCAN_CASES) {
                reportNodeScans();
              }
            },
          },
        );
      }
    }
  });
}
