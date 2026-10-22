import type {
  Action,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  deriveOperationId,
  deriveScope,
  documentModelStateReducer,
  generateId,
  redoTarget,
  retract,
  undoTarget,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { upgradeDocumentAction } from "../../src/actions/index.js";
import { KyselyWriteCache } from "../../src/cache/kysely-write-cache.js";
import { UndoTargetsCache } from "../../src/derivation/index.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import type { KyselyKeyframeStore } from "../../src/storage/kysely/keyframe-store.js";
import type { KyselyOperationStore } from "../../src/storage/kysely/store.js";
import {
  createCreateDocumentOperation,
  createTestOperationStore,
  createTestOperationStorePostgres,
} from "../factories.js";

type Setup = {
  store: KyselyOperationStore;
  keyframeStore: KyselyKeyframeStore;
  cleanup: () => Promise<void>;
};

const backends: [string, () => Promise<Setup>][] = [
  [
    "PGlite",
    async () => {
      const setup = await createTestOperationStore();
      return {
        store: setup.store,
        keyframeStore: setup.keyframeStore,
        cleanup: async () => {
          await setup.db.destroy();
          await setup.cleanup();
        },
      };
    },
  ],
  ["Postgres", createTestOperationStorePostgres],
];

const DOC_TYPE = "powerhouse/document-model";

const globalOf = (document: PHDocument): unknown =>
  (document.state as unknown as { global: unknown }).global;
const BRANCH = "main";

type Row = { action: Action; skip?: number; deniedReason?: string };
type Ids = Record<string, string>;
type Scenario = {
  name: string;
  base: (ids: Ids) => Row[];
  tail: (ids: Ids) => Row[];
  rederives: boolean;
};

function add(id: string, actionId?: string): Row {
  const action = addModule({ id, name: id });
  return {
    action: actionId === undefined ? action : { ...action, id: actionId },
  };
}

function retractOf(target: string, actionId: string): Row {
  return { action: { ...retract(target), id: actionId } };
}

// The repeated-id rows are what signatureVerification "log" admits.
const scenarios: Scenario[] = [
  {
    name: "content only",
    base: () => [add("a"), add("b")],
    tail: () => [add("c"), add("d")],
    rederives: false,
  },
  {
    name: "a denied row",
    base: () => [add("a")],
    tail: () => [{ ...add("b"), deniedReason: "denied" }, add("c")],
    rederives: false,
  },
  {
    name: "a RETRACT of a base row",
    base: (ids) => [add("a", ids.a), add("b")],
    tail: (ids) => [retractOf(ids.a, ids.r)],
    rederives: true,
  },
  {
    name: "a rewind",
    base: () => [add("a"), add("b")],
    tail: () => [{ ...add("c"), skip: 1 }],
    rederives: true,
  },
  {
    name: "a row a base RETRACT names before it exists",
    base: (ids) => [add("a"), retractOf(ids.late, ids.r)],
    tail: (ids) => [add("late", ids.late)],
    rederives: true,
  },
  {
    name: "a row repeating a base RETRACT's id (log mode)",
    base: (ids) => [add("a", ids.a), retractOf(ids.a, ids.r)],
    tail: (ids) => [add("x", ids.r)],
    rederives: true,
  },
  {
    name: "a row repeating a base content id (log mode)",
    base: (ids) => [add("a", ids.a), add("b")],
    tail: (ids) => [add("x", ids.a)],
    rederives: true,
  },
  {
    name: "two tail rows sharing an id (log mode)",
    base: () => [add("a")],
    tail: (ids) => [add("x", ids.d), add("y", ids.d)],
    rederives: true,
  },
];

describe.each(backends)("tail predicate agreement on %s", (_name, create) => {
  let setup: Setup;

  beforeAll(async () => {
    setup = await create();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  async function seed(docId: string): Promise<void> {
    await setup.store.apply(docId, DOC_TYPE, "document", BRANCH, 0, (txn) => {
      txn.addOperations(
        createCreateDocumentOperation(
          docId,
          DOC_TYPE,
          {},
          { protocolVersions: { "base-reducer": 3 } },
        ),
      );
    });
    await setup.store.apply(docId, DOC_TYPE, "document", BRANCH, 1, (txn) => {
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
  }

  async function append(docId: string, rows: Row[]): Promise<void> {
    for (const row of rows) {
      const head = await setup.store.getSince(docId, "global", BRANCH, -1);
      const index = head.results.length;
      const timestampUtcMs = new Date(
        Date.UTC(2026, 0, 1, 11, 0, index),
      ).toISOString();
      const operation: Operation = {
        id: deriveOperationId(docId, "global", BRANCH, row.action.id),
        index,
        timestampUtcMs,
        hash: `h${index}`,
        skip: row.skip ?? 0,
        action: { ...row.action, timestampUtcMs },
        ...(row.deniedReason === undefined
          ? {}
          : { deniedReason: row.deniedReason }),
      };
      await setup.store.apply(
        docId,
        DOC_TYPE,
        "global",
        BRANCH,
        index,
        (txn) => {
          txn.addOperations(operation);
        },
      );
    }
  }

  async function cold(docId: string) {
    const rows = (await setup.store.getSince(docId, "global", BRANCH, -1))
      .results;
    const state = documentModelDocumentModelModule.utils.createState();
    const initial = {
      header: {},
      state,
      initialState: state,
      operations: {},
      clipboard: [],
    } as unknown as PHDocument;
    const derived = deriveScope(
      initial,
      rows,
      () => documentModelStateReducer as never,
      "global",
    );
    return { rows, ...derived };
  }

  it.each(scenarios)(
    "both caches agree on $name",
    async ({ base, tail, rederives }) => {
      const ids: Ids = new Proxy({} as Ids, {
        get: (known, key: string) => (known[key] ??= generateId()),
      });
      const docId = generateId();
      await seed(docId);
      await append(docId, base(ids));

      const registry = new DocumentModelRegistry();
      registry.registerModules(documentModelDocumentModelModule);
      const writeCache = new KyselyWriteCache(
        setup.keyframeStore,
        setup.store,
        registry,
        { maxDocuments: 10, ringBufferSize: 30, keyframeInterval: 1000 },
      );
      await writeCache.startup();
      let undoDerives = 0;
      const undoCache = new UndoTargetsCache(setup.store, async () => {
        undoDerives++;
        const { rows, applied } = await cold(docId);
        return { rows, applied };
      });

      const baseRevision =
        (await setup.store.getSince(docId, "global", BRANCH, -1)).results
          .length - 1;
      await writeCache.getState(docId, "global", BRANCH, baseRevision);
      await undoCache.resolve(docId, "global", BRANCH);
      expect(undoDerives).toBe(1);

      await append(docId, tail(ids));
      const getSince = vi.spyOn(setup.store, "getSince");
      const head = await writeCache.getState(docId, "global", BRANCH);
      const writeRederived = getSince.mock.calls.some(
        ([, scope, , after]) => scope === "global" && after === -1,
      );
      getSince.mockRestore();
      const targets = await undoCache.resolve(docId, "global", BRANCH);
      const undoRederived = undoDerives === 2;

      const expected = await cold(docId);
      expect(globalOf(head)).toEqual(globalOf(expected.document));
      expect(targets).toEqual({
        undoTarget: undoTarget(expected.rows, expected.applied),
        redoTarget: redoTarget(expected.rows, expected.applied),
      });
      expect({ writeRederived, undoRederived }).toEqual({
        writeRederived: rederives,
        undoRederived: rederives,
      });
      await writeCache.shutdown();
    },
  );
});
