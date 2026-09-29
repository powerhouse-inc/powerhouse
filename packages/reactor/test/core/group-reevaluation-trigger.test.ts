import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { groupDocumentType } from "@powerhousedao/shared/document-model";
import { PGlite } from "@electric-sql/pglite";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../src/cache/kysely-operation-index.js";
import {
  createKyselyWatermarkProbe,
  SettledWatermark,
} from "../../src/catch-up/settled-watermark.js";
import {
  GROUP_REEVALUATION_TRIGGER,
  GroupReevaluationTrigger,
} from "../../src/core/group-reevaluation-trigger.js";
import { EventBus } from "../../src/events/event-bus.js";
import type { JobWriteReadyEvent } from "../../src/events/types.js";
import { ReactorEventTypes } from "../../src/events/types.js";
import type { IQueue } from "../../src/queue/interfaces.js";
import type { Job } from "../../src/queue/types.js";
import type { DocumentViewDatabase } from "../../src/read-models/types.js";
import type { Database as StorageDatabase } from "../../src/storage/kysely/types.js";
import {
  REACTOR_SCHEMA,
  runMigrations,
} from "../../src/storage/migrations/migrator.js";
import { createMockLogger } from "../factories.js";

function owc(
  documentId: string,
  documentType: string,
  scope: string,
  actionType: string,
  timestampUtcMs: string,
): OperationWithContext {
  return {
    operation: {
      id: `op-${actionType}-${timestampUtcMs}`,
      index: 0,
      skip: 0,
      hash: "h",
      timestampUtcMs,
      action: { id: "a", type: actionType, scope, timestampUtcMs, input: {} },
    },
    context: { documentId, documentType, scope, branch: "main" },
  } as never as OperationWithContext;
}

const databases: Kysely<DocumentViewDatabase>[] = [];

afterEach(async () => {
  for (const db of databases.splice(0)) await db.destroy();
});

async function harness(referencers: Record<string, string[]>) {
  const baseDb = new Kysely<DocumentViewDatabase>({
    dialect: new PGliteDialect(new PGlite()),
  });
  databases.push(baseDb);
  const migrated = await runMigrations(baseDb, REACTOR_SCHEMA);
  if (!migrated.success && migrated.error) throw migrated.error;
  const db = baseDb.withSchema(REACTOR_SCHEMA);

  const eventBus = new EventBus();
  const enqueued: Job[] = [];
  const queue = {
    enqueue: vi.fn().mockImplementation((job: Job) => {
      enqueued.push(job);
      return Promise.resolve();
    }),
  } as unknown as IQueue;
  const operationIndex = new KyselyOperationIndex(
    db as unknown as Kysely<StorageDatabase>,
  );
  vi.spyOn(operationIndex, "getGroupReferencers").mockImplementation(
    (groupId: string) => Promise.resolve(referencers[groupId] ?? []),
  );
  const watermark = new SettledWatermark(
    createKyselyWatermarkProbe(db as unknown as Kysely<StorageDatabase>),
    createMockLogger(),
  );

  const trigger = new GroupReevaluationTrigger(
    createMockLogger(),
    eventBus,
    queue,
    operationIndex,
    db,
  );
  trigger.attachCatchUp(watermark, 100_000);

  const emit = (operations: OperationWithContext[]) =>
    eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
      jobId: "job-1",
      operations,
      jobMeta: { batchId: "b", batchJobIds: ["job-1"] },
    } satisfies JobWriteReadyEvent);

  /** Commits membership changes to the index, as the executor would. */
  const commit = async (
    ...changes: Array<[groupId: string, type: string, timestampUtcMs: string]>
  ): Promise<OperationWithContext[]> => {
    const txn = operationIndex.start();
    txn.write(
      changes.map(([groupId, type, timestampUtcMs], i) => ({
        id: `op-${groupId}-${type}-${timestampUtcMs}`,
        documentId: groupId,
        documentType: groupDocumentType,
        scope: "global",
        branch: "main",
        sourceRemote: "",
        index: i,
        timestampUtcMs,
        hash: "h",
        skip: 0,
        action: {
          id: `a-${i}`,
          type,
          scope: "global",
          timestampUtcMs,
          input: {},
        },
      })),
    );
    const ordinals = await operationIndex.commit(txn);
    return operationIndex.getByOrdinals(ordinals);
  };

  const sweep = async () => trigger.sweep(await watermark.refresh(), []);

  const storedCursor = async () =>
    (
      await db
        .selectFrom("ViewState")
        .select("lastOrdinal")
        .where("readModelId", "=", GROUP_REEVALUATION_TRIGGER)
        .executeTakeFirst()
    )?.lastOrdinal;

  return {
    trigger,
    emit,
    commit,
    sweep,
    storedCursor,
    enqueued,
    queue,
    operationIndex,
  };
}

describe("GroupReevaluationTrigger", () => {
  it("enqueues one re-evaluation job per referencing document", async () => {
    const { trigger, emit, enqueued } = await harness({
      "g-1": ["doc-a", "doc-b"],
    });
    await trigger.startup();

    await emit([
      owc(
        "g-1",
        groupDocumentType,
        "global",
        "ADD_MEMBER",
        "2026-01-01T00:00:05.000Z",
      ),
    ]);

    expect(enqueued.map((job) => job.documentId).sort()).toEqual([
      "doc-a",
      "doc-b",
    ]);
    for (const job of enqueued) {
      expect(job.kind).toBe("reevaluation");
      expect(job.branch).toBe("main");
      expect(job.actions).toEqual([]);
      expect(job.operations).toEqual([]);
      expect(job.meta.triggerTimestampUtcMs).toBe("2026-01-01T00:00:05.000Z");
    }
  });

  it("carries the earliest membership timestamp across groups", async () => {
    const { trigger, emit, enqueued } = await harness({
      "g-1": ["doc-a"],
      "g-2": ["doc-a"],
    });
    await trigger.startup();

    await emit([
      owc(
        "g-1",
        groupDocumentType,
        "global",
        "REMOVE_MEMBER",
        "2026-01-01T00:00:09.000Z",
      ),
      owc(
        "g-2",
        groupDocumentType,
        "global",
        "ADD_MEMBER",
        "2026-01-01T00:00:03.000Z",
      ),
    ]);

    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].meta.triggerTimestampUtcMs).toBe(
      "2026-01-01T00:00:03.000Z",
    );
  });

  it("ignores writes that are not group membership changes", async () => {
    const { trigger, emit, enqueued, operationIndex } = await harness({
      "g-1": ["doc-a"],
    });
    await trigger.startup();

    await emit([
      // wrong document type
      owc(
        "doc-x",
        "powerhouse/document-model",
        "global",
        "ADD_MEMBER",
        "2026-01-01T00:00:01.000Z",
      ),
      // wrong scope
      owc(
        "g-1",
        groupDocumentType,
        "document",
        "ADD_MEMBER",
        "2026-01-01T00:00:01.000Z",
      ),
      // not a membership action
      owc(
        "g-1",
        groupDocumentType,
        "global",
        "SET_GROUP_NAME",
        "2026-01-01T00:00:01.000Z",
      ),
    ]);

    expect(enqueued).toHaveLength(0);
    expect(operationIndex.getGroupReferencers).not.toHaveBeenCalled();
  });

  it("stops enqueueing after shutdown", async () => {
    const { trigger, emit, enqueued } = await harness({ "g-1": ["doc-a"] });
    await trigger.startup();
    trigger.shutdown();

    await emit([
      owc(
        "g-1",
        groupDocumentType,
        "global",
        "ADD_MEMBER",
        "2026-01-01T00:00:01.000Z",
      ),
    ]);

    expect(enqueued).toHaveLength(0);
  });

  describe("catch-up", () => {
    it("enqueues for a membership change only the sweep found", async () => {
      const { trigger, commit, sweep, enqueued, storedCursor } = await harness({
        "g-1": ["doc-a"],
      });
      await trigger.startup();
      const [change] = await commit([
        "g-1",
        "ADD_MEMBER",
        "2026-01-01T00:00:05.000Z",
      ]);

      await sweep();

      expect(enqueued.map((job) => job.documentId)).toEqual(["doc-a"]);
      expect(enqueued[0]!.meta.triggerTimestampUtcMs).toBe(
        "2026-01-01T00:00:05.000Z",
      );
      expect(await storedCursor()).toBe(change!.context.ordinal);
    });

    it("does not enqueue again for a change the live path enqueued", async () => {
      const { trigger, commit, emit, sweep, enqueued, storedCursor } =
        await harness({ "g-1": ["doc-a"] });
      await trigger.startup();
      const changes = await commit(
        ["g-1", "ADD_MEMBER", "2026-01-01T00:00:05.000Z"],
        ["g-1", "SET_GROUP_NAME", "2026-01-01T00:00:06.000Z"],
      );
      await emit(changes);
      expect(enqueued).toHaveLength(1);

      await sweep();

      expect(enqueued).toHaveLength(1);
      expect(await storedCursor()).toBe(changes[1]!.context.ordinal);
    });

    it("holds its cursor below a change whose referencers could not be read", async () => {
      const { trigger, commit, sweep, enqueued, operationIndex, storedCursor } =
        await harness({ "g-1": ["doc-a"] });
      await trigger.startup();
      const [change] = await commit([
        "g-1",
        "REMOVE_MEMBER",
        "2026-01-01T00:00:05.000Z",
      ]);
      vi.mocked(operationIndex.getGroupReferencers).mockRejectedValueOnce(
        new Error("referencers unavailable"),
      );

      const held = await sweep();
      expect(held.blockedAt).toMatchObject({
        ordinal: change!.context.ordinal,
      });
      expect(await storedCursor()).toBe(change!.context.ordinal - 1);
      expect(enqueued).toHaveLength(0);

      await sweep();
      expect(enqueued.map((job) => job.documentId)).toEqual(["doc-a"]);
      expect(await storedCursor()).toBe(change!.context.ordinal);
    });

    it("starts at the watermark", async () => {
      const { trigger, commit, sweep, enqueued, storedCursor } = await harness({
        "g-1": ["doc-a"],
      });
      const history = await commit(
        ["g-1", "ADD_MEMBER", "2026-01-01T00:00:01.000Z"],
        ["g-1", "REMOVE_MEMBER", "2026-01-01T00:00:02.000Z"],
      );

      await trigger.startup();
      await sweep();

      expect(enqueued).toHaveLength(0);
      expect(await storedCursor()).toBe(history[1]!.context.ordinal);
    });
  });
});
