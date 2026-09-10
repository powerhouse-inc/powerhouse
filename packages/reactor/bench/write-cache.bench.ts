import { mkdirSync, writeFileSync } from "node:fs";
import {
  AddFileInputSchema,
  AddFolderInputSchema,
  defaultGlobalState,
  driveDocumentModelModule,
  handleTargetNameCollisions,
  isValidName,
  nodeReducer,
  type AddFileAction,
  type AddFolderAction,
  type DocumentDriveGlobalState,
  type DocumentDrivePHState,
  type FileNode,
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
      document = state.module.reducer(document, storedOp.action);
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
    version: 1,
    stamps: [...replayReadings.values()],
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
function validateDriveInput(action: Action): void {
  if (action.type === "ADD_FILE") {
    AddFileInputSchema().parse((action as AddFileAction).input);
    return;
  }

  if (action.type === "ADD_FOLDER") {
    AddFolderInputSchema().parse((action as AddFolderAction).input);
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
  /** node.ts:19/57 find, node.ts:23/61 isValidName, utils.ts:123 collisions. */
  reads: boolean;
  /** node.ts:46/82 sort. The push at node.ts:43/74 runs in every variant. */
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
 * A statement-for-statement mirror of nodeReducer.addFileOperation and
 * addFolderOperation (packages/shared/document-drive/src/reducers/node.ts:18-83
 * and the handleTargetNameCollisions it calls at src/utils.ts:123-147), checked
 * against those files at reactorSha 3cef6be7e, where they are still byte
 * identical to B-022's caafff10fa28. It exists only so a variant can drop the
 * read scans or the sort while running every other statement, which is what
 * splits the draft-proxy per-node tax; it must be re-checked against node.ts
 * and utils.ts on every future run, because drift would make it stop
 * representing the real body silently and the split would then measure nothing.
 *
 * Deliberate differences, all of them per-call constants that cancel out of a
 * per-node slope: the real addFileOperation ends in an optional dispatch call,
 * which this harness leaves undefined exactly as the plain-state leg of the
 * decomposition suite above does, and the two hrtime pairs that bracket the
 * read and write intervals are only taken for the variant that carries
 * `stamps`. The `real body (fidelity reference)` cases in the same suite run
 * the actual reducer through the identical harness, so the mirror's claim to
 * represent it is a measured ratio and not an assertion.
 */
function mirroredNodeBody(
  state: DocumentDriveGlobalState,
  action: AddFileAction | AddFolderAction,
  variant: MirrorVariant,
  stamps: MirrorSplitStamps | undefined,
): void {
  if (action.type === "ADD_FILE") {
    const input = action.input;
    let name = input.name;

    if (variant.reads) {
      const readStartedAt = stampStart(stamps);

      if (state.nodes.find((node) => node.id === input.id)) {
        throw new Error(`Node with id ${input.id} already exists!`);
      }

      if (!isValidName(input.name)) {
        throw new Error(
          `Invalid name: '${input.name}'. Names must not be empty or contain control characters.`,
        );
      }

      name = handleTargetNameCollisions({
        nodes: state.nodes,
        srcName: input.name,
        srcKind: "file",
        targetParentFolder: input.parentFolder || null,
      });

      addReadStamp(stamps, readStartedAt);
    }

    const writeStartedAt = stampStart(stamps);

    const fileNode: FileNode = {
      id: input.id,
      name,
      kind: "file",
      parentFolder: input.parentFolder ?? null,
      documentType: input.documentType,
    };
    state.nodes.push(fileNode);

    if (variant.sort) {
      state.nodes.sort((a, b) => a.id.localeCompare(b.id));
    }

    addWriteStamp(stamps, writeStartedAt);
    return;
  }

  const input = action.input;
  let name = input.name;

  if (variant.reads) {
    const readStartedAt = stampStart(stamps);

    if (state.nodes.find((node) => node.id === input.id)) {
      throw new Error(`Node with id ${input.id} already exists!`);
    }

    if (!isValidName(input.name)) {
      throw new Error(
        `Invalid name: '${input.name}'. Names must not be empty or contain control characters.`,
      );
    }

    name = handleTargetNameCollisions({
      nodes: state.nodes,
      srcName: input.name,
      srcKind: "folder",
      targetParentFolder: input.parentFolder || null,
    });

    addReadStamp(stamps, readStartedAt);
  }

  const writeStartedAt = stampStart(stamps);

  state.nodes.push({
    ...input,
    name,
    kind: "folder",
    parentFolder: input.parentFolder ?? null,
  });

  if (variant.sort) {
    state.nodes.sort((a, b) => a.id.localeCompare(b.id));
  }

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
  const pushShare = readScan / fullSlope;

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
      `touch, being the child drafts and the finalize they force ${touch.toFixed(4)}`,
      `push and everything the wrapper does anyway ${pushOnlySlope.toFixed(4)}`,
      `full wall ${fullSlope.toFixed(4)} us/node`,
      `cross-check read scan with the touch ${(noSortSlope - pushOnlySlope).toFixed(4)}`,
      `cross-check sort with the touch ${(noReadsSlope - pushOnlySlope).toFixed(4)} us/node`,
    ].join(" | "),
  );
  console.log(
    [
      `read/write split | ${leg} | shares of the full per-node wall slope from the case means`,
      `read scan ${(pushShare * 100).toFixed(1)}%`,
      `sort comparator ${((sortCompare / fullSlope) * 100).toFixed(1)}%`,
      `touch ${((touch / fullSlope) * 100).toFixed(1)}%`,
      `push and wrapper ${((pushOnlySlope / fullSlope) * 100).toFixed(1)}%`,
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

  console.log(
    [
      `read/write split | ${leg} | stamped body sub-intervals`,
      `reads ${stampedRead.toFixed(4)}`,
      `push+sort ${stampedWrite.toFixed(4)}`,
      `body total ${stampedBody.toFixed(4)} us/node`,
      `push+sort share of body ${((stampedWrite / stampedBody) * 100).toFixed(1)}%`,
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
 * How T-016's 12.6x draft-proxy per-node tax splits between the read scans at
 * node.ts:19/57 and utils.ts:123 and the push+sort at node.ts:43-46/74-82. A
 * tinybench case mean is the wall time of a whole measured function, so no case
 * can be a sub-interval of one reducer call; instead each leg runs the mirrored
 * body four ways over the same growing node list -- with the reads and the sort,
 * without the reads, without the sort, and with neither -- plus a no-body
 * baseline, and the differences between those means carry the split into the
 * record without needing the stamps. Every variant still pushes, so the node
 * list grows identically and the scan lengths a variant pays are the ones the
 * full body pays.
 *
 * The differences are not additive, and that is the point: on a draft the first
 * statement to touch an element pays for its child draft and the finalize that
 * unwraps it, so the read scans pay it in the full variant and the sort
 * comparator pays it once the reads are gone. `full - no reads` is therefore the
 * read scan without that touch cost, `full - no sort` the comparator without it,
 * and what those two leave between the push-only and full means is the touch
 * itself. Which side the touch belongs to depends on the question being asked,
 * so the report prints the body split three ways: read scan alone, push+sort
 * carrying the touch, and push+sort without it. The stamped sub-intervals
 * printed alongside charge the touch to the reads, the way the read statements
 * see it in the real body, and are the figure comparable to a reads-first
 * mirror. On the plain-state leg the touch term should collapse to noise, which
 * is the check that the decomposition is behaving.
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
