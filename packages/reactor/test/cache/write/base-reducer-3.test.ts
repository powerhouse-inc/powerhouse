import type {
  Action,
  Operation,
  PHDocument,
  Reducer,
  StateReducer,
  UpgradeTransition,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  createReducer,
  deriveOperationId,
  deriveScope,
  documentModelStateReducer,
  generateActionId,
  generateId,
  retract,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { upgradeDocumentAction } from "../../../src/actions/index.js";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import { DocumentModelRegistry } from "../../../src/registry/implementation.js";
import type { KyselyKeyframeStore } from "../../../src/storage/kysely/keyframe-store.js";
import type { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database as DatabaseSchema } from "../../../src/storage/kysely/types.js";
import {
  createCreateDocumentOperation,
  createTestOperationStore,
  createUpgradeDocumentOperation,
} from "../../factories.js";

const DOC_TYPE = "powerhouse/document-model";
const BRANCH = "main";
const KEYFRAME_INTERVAL = 4;

type GlobalState = { specifications: { modules: { id: string }[] }[] };

function globalOf(document: PHDocument): GlobalState {
  return (document.state as unknown as { global: GlobalState }).global;
}

function moduleIds(document: PHDocument): string[] {
  return globalOf(document).specifications[0].modules.map((m) => m.id);
}

describe("write cache on base-reducer 3", () => {
  let db: Kysely<DatabaseSchema>;
  let store: KyselyOperationStore;
  let keyframeStore: KyselyKeyframeStore;
  let cache: KyselyWriteCache;
  let cleanup: () => Promise<void>;
  let docId: string;
  let rows: Operation[];

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    db = setup.db;
    store = setup.store;
    keyframeStore = setup.keyframeStore;
    cleanup = setup.cleanup;

    const registry = new DocumentModelRegistry();
    registry.registerModules(documentModelDocumentModelModule);
    cache = new KyselyWriteCache(keyframeStore, store, registry, {
      maxDocuments: 10,
      ringBufferSize: 30,
      keyframeInterval: KEYFRAME_INTERVAL,
    });
    await cache.startup();

    docId = generateId();
    rows = [];
    await store.apply(docId, DOC_TYPE, "document", BRANCH, 0, (txn) => {
      txn.addOperations(
        createCreateDocumentOperation(
          docId,
          DOC_TYPE,
          {},
          { protocolVersions: { "base-reducer": 3 } },
        ),
      );
    });
    await store.apply(docId, DOC_TYPE, "document", BRANCH, 1, (txn) => {
      txn.addOperations({
        id: `${docId}-document-1`,
        index: 1,
        timestampUtcMs: "2026-01-01T10:00:00.000Z",
        hash: "spine-1",
        skip: 0,
        action: upgradeDocumentAction({
          documentId: docId,
          model: DOC_TYPE,
          fromVersion: 0,
          toVersion: 1,
          initialState: documentModelDocumentModelModule.utils.createState(),
        }) as never,
      });
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cache.shutdown();
    try {
      await db.destroy();
    } catch {
      // already destroyed
    }
    await cleanup();
  });

  async function append(
    action: Action,
    row: { skip?: number; deniedReason?: string } = {},
  ): Promise<string> {
    const index = rows.length;
    const timestampUtcMs = new Date(
      Date.UTC(2026, 0, 1, 11, 0, index),
    ).toISOString();
    const operation: Operation = {
      id: deriveOperationId(docId, "global", BRANCH, action.id),
      index,
      timestampUtcMs,
      hash: `h${index}`,
      skip: row.skip ?? 0,
      action: { ...action, timestampUtcMs },
      ...(row.deniedReason === undefined
        ? {}
        : { deniedReason: row.deniedReason }),
    };
    await store.apply(docId, DOC_TYPE, "global", BRANCH, index, (txn) => {
      txn.addOperations(operation);
    });
    rows.push(operation);
    return action.id;
  }

  function add(id: string): Promise<string> {
    return append(addModule({ id, name: id }));
  }

  /** The state deriveScope gives over the stored rows through `revision`. */
  function derived(revision = rows.length - 1): GlobalState {
    const state = documentModelDocumentModelModule.utils.createState();
    const initial = {
      header: {},
      state,
      initialState: state,
      operations: {},
      clipboard: [],
    } as unknown as PHDocument;
    return globalOf(
      deriveScope(
        initial,
        rows.filter((operation) => operation.index <= revision),
        () => documentModelStateReducer as never,
        "global",
      ).document,
    );
  }

  async function persistKeyframeAt(revision: number): Promise<void> {
    await cache.getState(docId, "global", BRANCH, revision);
    await expect
      .poll(async () =>
        (await keyframeStore.listKeyframes(docId, "global", BRANCH)).map(
          (k) => k.revision,
        ),
      )
      .toContain(revision);
    cache.clear();
  }

  function readsWholeLog(getSince: MockInstance): boolean {
    return getSince.mock.calls.some(
      ([, scope, , after]) => scope === "global" && after === -1,
    );
  }

  describe("cold", () => {
    it("derives the head with the rule and keeps the stored rows", async () => {
      await add("a");
      const b = await add("b");
      const undoB = await append(retract(b));
      await add("c");
      await append(retract(undoB));

      const document = await cache.getState(docId, "global", BRANCH);

      expect(globalOf(document)).toEqual(derived());
      expect(moduleIds(document)).toEqual(["a", "b", "c"]);
      expect(document.header.revision.global).toBe(rows.length);
      expect(document.operations.global.at(-1)).toMatchObject({
        index: 4,
        hash: "h4",
      });
    });

    it("derives a historical revision without the retractions after it", async () => {
      await add("a");
      const b = await add("b");
      await append(retract(b));
      await add("c");

      const atB = await cache.getState(docId, "global", BRANCH, 1);
      const atRetract = await cache.getState(docId, "global", BRANCH, 2);

      expect(globalOf(atB)).toEqual(derived(1));
      expect(moduleIds(atB)).toEqual(["a", "b"]);
      expect(atB.header.revision.global).toBe(2);
      expect(globalOf(atRetract)).toEqual(derived(2));
      expect(moduleIds(atRetract)).toEqual(["a"]);
    });

    it("applies nothing for a row that throws", async () => {
      await add("a");
      await add("a");
      await add("b");

      const document = await cache.getState(docId, "global", BRANCH);

      expect(globalOf(document)).toEqual(derived());
      expect(moduleIds(document)).toEqual(["a", "b"]);
    });

    it("applies nothing for a denied row", async () => {
      await add("a");
      await append(addModule({ id: "b", name: "b" }), {
        deniedReason: "denied",
      });
      await add("c");

      const document = await cache.getState(docId, "global", BRANCH);

      expect(globalOf(document)).toEqual(derived());
      expect(moduleIds(document)).toEqual(["a", "c"]);
    });
  });

  describe("from a keyframe", () => {
    it("applies the rows after it when none retracts", async () => {
      for (const id of ["a", "b", "c", "d", "e"]) await add(id);
      await persistKeyframeAt(4);
      await add("f");
      await add("a");
      await append(addModule({ id: "g", name: "g" }), {
        deniedReason: "denied",
      });
      const getSince = vi.spyOn(store, "getSince");

      const document = await cache.getState(docId, "global", BRANCH, 7);

      expect(globalOf(document)).toEqual(derived());
      expect(moduleIds(document)).toEqual(["a", "b", "c", "d", "e", "f"]);
      expect(readsWholeLog(getSince)).toBe(false);
    });

    it("rebuilds the whole log for a RETRACT after it of a row before it", async () => {
      const a = await add("a");
      for (const id of ["b", "c", "d", "e"]) await add(id);
      await persistKeyframeAt(4);
      await append(retract(a));
      const getSince = vi.spyOn(store, "getSince");

      const document = await cache.getState(docId, "global", BRANCH, 5);

      expect(globalOf(document)).toEqual(derived());
      expect(moduleIds(document)).toEqual(["b", "c", "d", "e"]);
      expect(readsWholeLog(getSince)).toBe(true);
    });

    it("rebuilds the whole log for a row after it that a stored RETRACT names", async () => {
      const late = addModule({ id: "late", name: "late" });
      await add("a");
      await append(retract(late.id));
      for (const id of ["b", "c", "d"]) await add(id);
      await persistKeyframeAt(4);
      await append(late);
      const getSince = vi.spyOn(store, "getSince");

      const document = await cache.getState(docId, "global", BRANCH, 5);

      expect(globalOf(document)).toEqual(derived());
      expect(moduleIds(document)).toEqual(["a", "b", "c", "d"]);
      expect(readsWholeLog(getSince)).toBe(true);
    });

    it("rebuilds the whole log for a rewind after it", async () => {
      for (const id of ["a", "b", "c", "d", "e"]) await add(id);
      await persistKeyframeAt(4);
      await append(addModule({ id: "f", name: "f" }), { skip: 2 });
      const getSince = vi.spyOn(store, "getSince");

      const document = await cache.getState(docId, "global", BRANCH, 5);

      expect(globalOf(document)).toEqual(derived());
      expect(moduleIds(document)).toEqual(["a", "b", "c", "f"]);
      expect(readsWholeLog(getSince)).toBe(true);
    });

    it("persists keyframes that hold the derived state", async () => {
      await add("a");
      const b = await add("b");
      await append(retract(b));
      await add("c");
      await add("d");

      await persistKeyframeAt(4);
      const [keyframe] = await keyframeStore.listKeyframes(
        docId,
        "global",
        BRANCH,
      );
      const stored = await keyframeStore.findNearestKeyframe(
        docId,
        "global",
        BRANCH,
        keyframe.revision,
      );

      expect(globalOf(stored!.document)).toEqual(derived(4));
      expect(moduleIds(stored!.document)).toEqual(["a", "c", "d"]);
    });
  });

  describe("warm", () => {
    it("serves a cached head without reading the store", async () => {
      await add("a");
      const b = await add("b");
      await append(retract(b));
      const first = await cache.getState(docId, "global", BRANCH);
      const getSince = vi.spyOn(store, "getSince");

      const second = await cache.getState(docId, "global", BRANCH);

      expect(globalOf(second)).toEqual(globalOf(first));
      expect(globalOf(second)).toEqual(derived());
      expect(getSince).not.toHaveBeenCalled();
    });

    it("applies the rows after a cached snapshot when none retracts", async () => {
      await add("a");
      const b = await add("b");
      await append(retract(b));
      await cache.getState(docId, "global", BRANCH, 2);
      await add("c");
      await add("a");
      const getSince = vi.spyOn(store, "getSince");

      const document = await cache.getState(docId, "global", BRANCH);

      expect(globalOf(document)).toEqual(derived());
      expect(moduleIds(document)).toEqual(["a", "c"]);
      expect(document.operations.global.at(-1)).toMatchObject({
        index: 4,
        hash: "h4",
      });
      expect(readsWholeLog(getSince)).toBe(false);
    });

    it("rebuilds the whole log for a RETRACT after a cached snapshot", async () => {
      const a = await add("a");
      await add("b");
      await cache.getState(docId, "global", BRANCH, 1);
      await append(retract(a));
      const getSince = vi.spyOn(store, "getSince");

      const document = await cache.getState(docId, "global", BRANCH);

      expect(globalOf(document)).toEqual(derived());
      expect(moduleIds(document)).toEqual(["b"]);
      expect(readsWholeLog(getSince)).toBe(true);
    });
  });

  describe("across a model upgrade", () => {
    const LOG_TYPE = "test/log";
    type LogState = { global: { log: string[] } };
    const logReducer =
      (version: number): StateReducer<any> =>
      (state: LogState, action) => {
        if (action.type === "LOG") {
          state.global.log.push(
            `v${version}:${(action.input as { entry: string }).entry}`,
          );
        }
      };
    const reducers: Record<number, Reducer<any>> = {
      1: createReducer(logReducer(1)),
      2: createReducer(logReducer(2)),
    };
    const upgradeToV2: UpgradeTransition = {
      toVersion: 2,
      upgradeReducer: (document: PHDocument) => ({
        ...document,
        state: {
          ...document.state,
          global: {
            log: [
              ...(document.state as unknown as LogState).global.log,
              "upgraded",
            ],
          },
        },
      }),
    };

    function logAction(entry: string): Action {
      return {
        id: generateActionId(),
        type: "LOG",
        scope: "global",
        timestampUtcMs: "",
        input: { entry },
      };
    }

    it("applies the upgrade at its boundary to the derived state", async () => {
      const registry = new DocumentModelRegistry();
      vi.spyOn(registry, "getModule").mockImplementation(
        (_type, version) => ({ reducer: reducers[version ?? 2] }) as never,
      );
      vi.spyOn(registry, "computeUpgradePath").mockReturnValue([upgradeToV2]);
      const logCache = new KyselyWriteCache(keyframeStore, store, registry, {
        maxDocuments: 10,
        ringBufferSize: 30,
        keyframeInterval: KEYFRAME_INTERVAL,
      });

      docId = generateId();
      const toV2 = createUpgradeDocumentOperation(docId, 1, 2, undefined, {
        index: 2,
      });
      const spine = [
        createCreateDocumentOperation(
          docId,
          LOG_TYPE,
          {},
          { protocolVersions: { "base-reducer": 3 } },
        ),
        createUpgradeDocumentOperation(docId, 0, 1, {
          global: { log: [] },
          local: {},
        }),
        {
          ...toV2,
          action: {
            ...toV2.action,
            input: {
              documentId: docId,
              fromVersion: 1,
              toVersion: 2,
              revision: { global: 2 },
            },
          },
        },
      ];
      for (const operation of spine) {
        await store.apply(
          docId,
          LOG_TYPE,
          "document",
          BRANCH,
          operation.index,
          (txn) => {
            txn.addOperations(operation);
          },
        );
      }
      const a = await append(logAction("a"));
      await append(logAction("b"));
      await append(retract(a));
      await append(logAction("c"));

      const document = await logCache.getState(docId, "global", BRANCH);

      expect((document.state as unknown as LogState).global.log).toEqual([
        "v1:b",
        "upgraded",
        "v2:c",
      ]);
    });
  });
});
