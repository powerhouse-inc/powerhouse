import {
  AddFileInputSchema,
  AddFolderInputSchema,
  defaultGlobalState,
  driveDocumentModelModule,
  nodeReducer,
  type AddFileAction,
  type AddFolderAction,
  type DocumentDrivePHState,
} from "@powerhousedao/shared/document-drive";
import {
  createReducer,
  deriveOperationId,
  generateId,
  isDocumentAction,
  type Action,
  type DocumentModelModule,
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
  /** A floor on samples, for cases whose iteration is slower than `time`. */
  iterations?: number;
  /** The module the case's registry holds, when it must not be the plain one. */
  module?: DocumentModelModule<DocumentDrivePHState>;
  /**
   * Turns on the in-situ replay stamps for this case: the accumulators are
   * cleared once prepare has finished, so nothing prepare replays is counted,
   * and the run phase prints its decomposition under this label.
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
        reportReplayStamps(caseOptions.stamps);
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
 * from the create() draft and finalize around it.
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

function reportReplayStamps(label: string): void {
  const { wallNs, bodyNs, wallCalls, bodyCalls } = replayStamps;

  if (wallCalls === 0 || bodyCalls === 0) {
    console.log(`replay stamps | ${label} | no reducer calls recorded`);
    return;
  }

  const wallUsPerCall = Number(wallNs) / 1000 / wallCalls;
  const bodyUsPerCall = Number(bodyNs) / 1000 / bodyCalls;
  const outsideUsPerCall = wallUsPerCall - bodyUsPerCall;
  const bodySharePct = (Number(bodyNs) / Number(wallNs)) * 100;

  console.log(
    [
      `replay stamps | ${label}`,
      `reducer calls ${wallCalls} (body ${bodyCalls})`,
      `module.reducer wall ${wallUsPerCall.toFixed(3)} us/call`,
      `reducer body in draft ${bodyUsPerCall.toFixed(3)} us/call`,
      `create() draft+finalize+base ${outsideUsPerCall.toFixed(3)} us/call`,
      `body share ${bodySharePct.toFixed(1)}%`,
    ].join(" | "),
  );
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
    AddFileInputSchema().parse(fileAction.input);
    nodeReducer.addFileOperation(state.global, fileAction, dispatch);
    return undefined;
  }

  if (action.type === "ADD_FOLDER") {
    const folderAction = action as AddFolderAction;
    AddFolderInputSchema().parse(folderAction.input);
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

/** Op count and the time budget its cold-miss replay needs for n >= 10. */
const REPLAY_DECOMPOSITION_CASES: [number, number][] = [
  [100, 2000],
  [500, 6000],
  [1000, 8000],
  [2000, 8000],
];

/**
 * Why a cold-miss rebuild costs about 39x for 10x the operations. Each op count
 * runs two legs: a full cold miss through a module whose reducer is timed, and
 * the same actions through the drive reducer body alone on plain state, with no
 * mutative draft and no base reducer. The recorded pair says how much of the
 * growth the body's own work accounts for; the stamps printed by the first leg
 * split its replay into the body measured inside the draft and everything
 * create() does around it.
 */
describe("Write Cache Cold Miss Replay Decomposition", () => {
  for (const [count, budgetMs] of REPLAY_DECOMPOSITION_CASES) {
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
        iterations: 10,
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
      { time: 2000, iterations: 10, throws: true },
    );
  }
});
