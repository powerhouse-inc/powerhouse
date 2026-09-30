import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  isPurgeMarker,
  setModelName,
  type DocumentModelModule,
  type Operation,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import type { IProcessor } from "@powerhousedao/shared/processors";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addRelationshipAction } from "../../../src/actions/index.js";
import {
  readCatchUpStatus,
  rescanCatchUp,
  type CatchUpAdminDatabase,
} from "../../../src/admin/catch-up-admin.js";
import type { Kysely } from "kysely";
import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import type { IReactor } from "../../../src/core/types.js";
import { buildSingleJobMeta } from "../../../src/core/utils.js";
import type { JobWriteReadyEvent } from "../../../src/events/types.js";
import type { Job } from "../../../src/queue/types.js";
import { DocumentNotFoundError } from "../../../src/shared/errors.js";
import { JobStatus, type JobInfo } from "../../../src/shared/types.js";
import { DocumentExistence } from "../../../src/storage/interfaces.js";

import { createDocModelDocument } from "../../factories.js";
import {
  buildNode,
  CaptureChannels,
  enqueuePurge,
  expectPurged,
  holdIndexCommitOn,
  legacyDrive,
  lockWaiters,
  memberships,
  PgDatabase,
  purge,
  purgeLockWaiters,
  quiesce,
  stopNode,
  succeeded,
  tombstone,
  until,
  waitForJob,
  waitForTombstone,
  WRITE_READY,
  type Node,
  type ReactorDb,
} from "./harness.js";

const DATABASE = "reactor_e2e_resurrection";
const DOC_TYPE = "powerhouse/document-model";
const REMOTE = "capture";

function carries(id: string, type: string) {
  return (event: JobWriteReadyEvent) =>
    event.operations.some(
      (op) => op.context.documentId === id && op.operation.action.type === type,
    );
}

async function create(node: Node, id: string): Promise<void> {
  await succeeded(
    node.reactor,
    node.reactor.create(createDocModelDocument({ id })),
  );
}

async function createDrive(node: Node, id: string): Promise<void> {
  await succeeded(node.reactor, node.reactor.create(legacyDrive(id)));
}

async function rename(node: Node, id: string, name: string): Promise<void> {
  await succeeded(
    node.reactor,
    node.reactor.execute(id, "main", [setModelName({ name })]),
  );
}

async function remove(node: Node, id: string): Promise<void> {
  await succeeded(node.reactor, node.reactor.deleteDocument(id));
}

async function adopt(node: Node, parent: string, child: string): Promise<void> {
  await succeeded(
    node.reactor,
    node.reactor.execute(parent, "main", [
      addRelationshipAction(parent, child, "child"),
    ]),
  );
}

/** Runs a write whose JOB_WRITE_READY no subscriber sees; returns the event. */
async function lost(
  node: Node,
  matches: (event: JobWriteReadyEvent) => boolean,
  write: () => Promise<unknown>,
): Promise<JobWriteReadyEvent> {
  const dropped = node.bus.dropWriteReady(matches);
  await write();
  return dropped;
}

async function holdRowLock(
  db: ReactorDb,
  documentId: string,
  scope: string,
): Promise<{ release: () => Promise<void> }> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let locked!: () => void;
  const taken = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const done = db.transaction().execute(async (trx) => {
    const rows = await trx
      .selectFrom("DocumentSnapshot")
      .select("id")
      .where("documentId", "=", documentId)
      .where("scope", "=", scope)
      .forUpdate()
      .execute();
    if (rows.length === 0)
      throw new Error(`no ${scope} snapshot for ${documentId}`);
    locked();
    await released;
  });
  await Promise.race([taken, done]);
  return {
    release: async () => {
      release();
      await done;
    },
  };
}

/** A gate the next matching read waits at after it has read. */
function gateAfterRead<T>(
  target: object,
  method: string,
  matches: (result: T) => boolean,
): { entered: Promise<void>; open: () => void } {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  let enter!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const original = (
    target as Record<string, (...args: unknown[]) => Promise<T>>
  )[method]!.bind(target);
  vi.spyOn(
    target as Record<string, () => unknown>,
    method as never,
  ).mockImplementation((async (...args: unknown[]) => {
    const result = await original(...args);
    if (matches(result)) {
      enter();
      await opened;
    }
    return result;
  }) as never);
  return { entered, open };
}

function namesDocument(id: string) {
  return (
    result: OperationWithContext[] | { results: OperationWithContext[] },
  ) => {
    const items = Array.isArray(result) ? result : result.results;
    return items.some((op) => op.context.documentId === id);
  };
}

async function peerReactor(): Promise<IReactor> {
  return new ReactorBuilder()
    .withDocumentModelSources([
      documentModelDocumentModelModule as unknown as DocumentModelModule,
      driveDocumentModelModule as unknown as DocumentModelModule,
    ])
    .build();
}

async function documentOps(
  reactor: IReactor,
  id: string,
): Promise<Operation[]> {
  const page = await reactor.getOperations(id, {
    branch: "main",
    scopes: ["document"],
  });
  return page.document?.results ?? [];
}

function recordingProcessor(): IProcessor & {
  received: OperationWithContext[];
} {
  const processor = {
    received: [] as OperationWithContext[],
    onOperations: (ops: OperationWithContext[]) => {
      processor.received.push(...ops);
      return Promise.resolve();
    },
    onDisconnect: () => Promise.resolve(),
  };
  return processor;
}

/** Probes the watermark, as the catch-up interval would, so sync derives. */
function probed(node: Node, predicate: () => boolean) {
  return async () => {
    await node.module.settledWatermark.refresh();
    return predicate();
  };
}

function expectNoBlockedConsumer(node: Node): void {
  const blocked = node.module.catchUp
    .status()
    .consumers.filter((consumer) => consumer.blockedAt !== undefined);
  expect(blocked, "no consumer cursor is blocked").toEqual([]);
}

/** Sweeps until every read-model cursor passes `ordinal`; the cluster shares xmin. */
async function expectCursorsPast(node: Node, ordinal: number): Promise<void> {
  const behind = async () => {
    const status = await readCatchUpStatus(
      node.db as unknown as Kysely<CatchUpAdminDatabase>,
    );
    return status.cursors.filter(
      (cursor) => cursor.kind === "read-model" && cursor.lastOrdinal < ordinal,
    );
  };
  await until(
    `every read-model cursor passes ${ordinal}`,
    async () => {
      await node.module.catchUp.sweepNow();
      return (await behind()).length === 0;
    },
    15_000,
  ).catch(() => undefined);
  expect(
    await behind(),
    `every read-model cursor at or past ${ordinal}`,
  ).toEqual([]);
}

describe("resurrection probes [Postgres]", () => {
  let pg: PgDatabase;
  let a: Node | undefined;
  let peer: IReactor | undefined;
  let capture: CaptureChannels;

  beforeEach(async () => {
    pg = await PgDatabase.create(DATABASE);
    capture = new CaptureChannels();
    a = await buildNode({
      name: "a",
      db: pg,
      channelFactory: capture.factory(),
      maxConcurrency: 2,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await stopNode(a);
      peer?.kill();
    } finally {
      a = undefined;
      peer = undefined;
      await pg.destroy();
    }
  });

  it("a view transaction held open across the purge commits after it and inserts nothing", async () => {
    const node = a!;
    await create(node, "x");
    const xEdit = await lost(node, carries("x", "SET_MODEL_NAME"), () =>
      node.reactor.execute("x", "main", [setModelName({ name: "late" })]),
    );
    await remove(node, "x");
    await create(node, "y");
    const yEdit = await lost(node, carries("y", "SET_MODEL_NAME"), () =>
      node.reactor.execute("y", "main", [setModelName({ name: "y2" })]),
    );

    const rowLock = await holdRowLock(node.db, "y", "header");
    // enqueue resolves once an executor has run the job, so it is not awaited
    let purging: Promise<JobInfo> | undefined;
    let applying: Promise<void> | undefined;
    try {
      // y first: the transaction stalls on y's row before it touches x.
      applying = node.module.documentView.indexOperations([
        ...yEdit.operations,
        ...xEdit.operations,
      ]);
      await until(
        "the view transaction waits on y's row lock",
        async () => (await lockWaiters(node.db)) >= 1,
      );

      purging = enqueuePurge(node, "x");
      await until(
        "the purge waits behind the view transaction or has committed",
        async () =>
          (await lockWaiters(node.db)) >= 2 ||
          (await tombstone(node.db, "x")) !== undefined,
      );

      await rowLock.release();
      await applying;
    } finally {
      await rowLock.release().catch(() => undefined);
      await applying?.catch(() => undefined);
    }

    await waitForTombstone(node.db, "x");
    await waitForJob(node.reactor, (await purging!).id);
    await expectPurged(node.db, "x", { documentType: DOC_TYPE });
  });

  it("a JOB_WRITE_READY for the id delivered after the purge inserts nothing in view, indexer or keyframes", async () => {
    const node = a!;
    await createDrive(node, "d");
    await create(node, "x");
    const adopted = await lost(node, carries("d", "ADD_RELATIONSHIP"), () =>
      node.reactor.execute("d", "main", [
        addRelationshipAction("d", "x", "child"),
      ]),
    );
    const edited = await lost(node, carries("x", "SET_MODEL_NAME"), () =>
      node.reactor.execute("x", "main", [setModelName({ name: "late" })]),
    );
    await remove(node, "x");

    await purge(node, "x");
    await node.module.readModelCoordinator.drain();

    await node.bus.emit(WRITE_READY, edited);
    await node.bus.emit(WRITE_READY, adopted);
    await node.module.readModelCoordinator.drain();

    await expectPurged(node.db, "x", { documentType: DOC_TYPE });
    const outgoing = await node.module.documentIndexer.getOutgoing("d", [
      "child",
    ]);
    expect(outgoing.results.map((edge) => edge.targetId)).not.toContain("x");
  });

  it("a load job that writes rows for the id and started first commits, and is then purged", async () => {
    const node = a!;
    peer = await peerReactor();
    await createDrive(node, "d");
    await succeeded(
      peer,
      peer.load("d", "main", await documentOps(node.reactor, "d")),
    );
    await create(node, "x");
    await remove(node, "x");
    await succeeded(
      peer,
      peer.execute("d", "main", [addRelationshipAction("d", "x", "child")]),
    );
    const adoption = (await documentOps(peer, "d")).at(-1)!;
    expect(adoption.action.type).toBe("ADD_RELATIONSHIP");

    const hold = await holdIndexCommitOn(node, "d");
    let loading: Promise<unknown> | undefined;
    try {
      loading = node.reactor.load("d", "main", [adoption]);
      await hold.waitUntilHeld();

      const purging = enqueuePurge(node, "x");
      await until(
        "the purge waits on the load's lock or has committed",
        async () =>
          (await purgeLockWaiters(node.db)) >= 1 ||
          (await tombstone(node.db, "x")) !== undefined,
      );
      await hold.release();

      await succeeded(node.reactor, loading as Promise<JobInfo>);
      await waitForJob(node.reactor, (await purging).id);
    } finally {
      await hold.remove();
      await loading?.catch(() => undefined);
    }
    await node.module.readModelCoordinator.drain();

    const { ordinal } = await expectPurged(node.db, "x", {
      documentType: DOC_TYPE,
    });
    const loaded = await node.db
      .selectFrom("operation_index_operations")
      .select("ordinal")
      .where("opId", "=", adoption.id)
      .executeTakeFirstOrThrow();
    expect(Number(loaded.ordinal), "the load committed first").toBeLessThan(
      ordinal,
    );
    expect((await memberships(node.db, "x")).map((m) => m.joined)).toEqual([
      ordinal,
    ]);
  });

  it("a load job that writes rows for the id and waits on the purge is accepted without them", async () => {
    const node = a!;
    peer = await peerReactor();
    await createDrive(node, "d");
    await succeeded(
      peer,
      peer.load("d", "main", await documentOps(node.reactor, "d")),
    );
    await create(node, "x");
    await remove(node, "x");
    await succeeded(
      peer,
      peer.execute("d", "main", [addRelationshipAction("d", "x", "child")]),
    );
    const adoption = (await documentOps(peer, "d")).at(-1)!;

    const hold = await holdIndexCommitOn(node, "x");
    let purging: Promise<JobInfo> | undefined;
    let loading: Promise<JobInfo> | undefined;
    try {
      purging = enqueuePurge(node, "x");
      await hold.waitUntilHeld();

      loading = node.reactor.load("d", "main", [adoption]);
      await until(
        "the load waits on the purge's lock",
        async () => (await purgeLockWaiters(node.db)) >= 1,
      );
      await hold.release();
    } finally {
      await hold.remove();
    }

    await purging;
    await waitForTombstone(node.db, "x");
    const load = await waitForJob(node.reactor, (await loading!).id);
    expect(load.status, load.error?.message).toBe(JobStatus.READ_READY);
    await node.module.readModelCoordinator.drain();

    await expectPurged(node.db, "x", { documentType: DOC_TYPE });
    expect(await memberships(node.db, "x")).toEqual([]);
    expect((await documentOps(node.reactor, "d")).map((op) => op.id)).toContain(
      adoption.id,
    );
  });

  it("a load job for the id queued behind the purge is refused with DocumentPurgedError", async () => {
    const node = a!;
    await create(node, "x");
    await rename(node, "x", "before");
    const [old] = (
      await node.reactor.getOperations("x", {
        branch: "main",
        scopes: ["global"],
      })
    ).global!.results;
    await remove(node, "x");

    const hold = await holdIndexCommitOn(node, "x");
    let purging: Promise<JobInfo> | undefined;
    let loading: Promise<JobInfo> | undefined;
    try {
      purging = enqueuePurge(node, "x");
      await hold.waitUntilHeld();
      loading = node.reactor.load("x", "main", [old!]);
      await hold.release();
    } finally {
      await hold.remove();
    }

    await purging;
    const load = await waitForJob(node.reactor, (await loading!).id);
    expect(load.status).toBe(JobStatus.FAILED);
    expect(load.error?.name).toBe("DocumentPurgedError");
    expect(load.job?.retryCount ?? 0, "not retried").toBe(0);
    await expectPurged(node.db, "x", { documentType: DOC_TYPE });
  });

  it("a reevaluation job queued before the purge committed completes with no writes", async () => {
    const node = a!;
    await create(node, "x");
    await remove(node, "x");

    const hold = await holdIndexCommitOn(node, "x");
    const jobId = crypto.randomUUID();
    let purging: Promise<JobInfo> | undefined;
    let queued: Promise<void> | undefined;
    try {
      purging = enqueuePurge(node, "x");
      await hold.waitUntilHeld();

      const job: Job = {
        id: jobId,
        kind: "reevaluation",
        documentId: "x",
        scope: "global",
        branch: "main",
        actions: [],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        maxRetries: 3,
        errorHistory: [],
        meta: {
          ...buildSingleJobMeta(jobId),
          triggerTimestampUtcMs: new Date(0).toISOString(),
        },
      };
      node.module.jobTracker.registerJob({
        id: jobId,
        documentId: "x",
        status: JobStatus.PENDING,
        createdAtUtcIso: job.createdAt,
        consistencyToken: {
          version: 1,
          createdAtUtcIso: job.createdAt,
          coordinates: [],
        },
        meta: job.meta,
      });
      queued = node.module.queue.enqueue(job);
      await hold.release();
    } finally {
      await hold.remove();
    }

    await purging;
    await queued;
    const reevaluated = await waitForJob(node.reactor, jobId);
    expect(reevaluated.status).toBe(JobStatus.FAILED);
    expect(reevaluated.error?.name).toBe("DocumentPurgedError");
    expect(reevaluated.job?.retryCount ?? 0, "not retried").toBe(0);
    await expectPurged(node.db, "x", { documentType: DOC_TYPE });
  });

  it("positional replay of a drive history with ADD_RELATIONSHIP to a purged target writes no membership or Document row", async () => {
    const node = a!;
    peer = await peerReactor();
    await createDrive(node, "d");
    await succeeded(
      peer,
      peer.load("d", "main", await documentOps(node.reactor, "d")),
    );
    await create(node, "x");
    await create(node, "y");

    // The peer's adoption of y sorts before the local adoption of x.
    await succeeded(
      peer,
      peer.execute("d", "main", [addRelationshipAction("d", "y", "child")]),
    );
    const earlier = (await documentOps(peer, "d")).at(-1)!;
    await quiesce(5);
    await adopt(node, "d", "x");
    const local = (await documentOps(node.reactor, "d")).at(-1)!;
    expect(
      Date.parse(local.timestampUtcMs),
      "the local adoption is later",
    ).toBeGreaterThan(Date.parse(earlier.timestampUtcMs));
    await remove(node, "x");
    const { ordinal } = await purge(node, "x");
    const reopened = await memberships(node.db, "x");

    const load = await waitForJob(
      node.reactor,
      (await node.reactor.load("d", "main", [earlier])).id,
    );
    expect(load.status, load.error?.message).toBe(JobStatus.READ_READY);
    await node.module.readModelCoordinator.drain();

    const stream = await documentOps(node.reactor, "d");
    const adoptions = stream
      .filter((op) => op.action.type === "ADD_RELATIONSHIP")
      .map((op) => (op.action.input as { targetId: string }).targetId);
    expect(
      adoptions.slice(-2),
      "the local adoption was replayed after",
    ).toEqual(["y", "x"]);
    expect(await memberships(node.db, "x")).toEqual(reopened);
    expect(reopened.map((m) => m.joined)).toEqual([ordinal]);
    await expectPurged(node.db, "x", { documentType: DOC_TYPE });
  });

  it("a dropped purge JOB_WRITE_READY: every consumer applies the marker from its sweep, and the outbox serves it", async () => {
    const node = a!;
    const processor = recordingProcessor();
    await node.module.processorManager.registerFactory("pkg", () => [
      { processor, filter: { documentType: [DOC_TYPE] } },
    ]);
    await createDrive(node, "d");
    await create(node, "x");
    await adopt(node, "d", "x");
    await capture.add(node, REMOTE, "d");
    await remove(node, "x");
    await node.module.catchUp.sweepNow();

    const dropped = node.bus.dropWriteReadyFor("x");
    const { ordinal } = await purge(node, "x");
    const event = await dropped;
    expect(event.operations.map((op) => op.operation.action.type)).toEqual([
      "PURGE_DOCUMENT",
    ]);

    await node.module.catchUp.sweepNow();
    await node.module.catchUp.sweepNow();

    const { marker } = await expectPurged(node.db, "x", {
      documentType: DOC_TYPE,
    });
    expect(
      await node.module.documentView.exists(
        ["x"],
        DocumentExistence.IncludingDeleted,
      ),
    ).toEqual([true]);
    await expect(node.module.documentView.get("x")).rejects.toSatisfy((error) =>
      DocumentNotFoundError.isError(error),
    );
    expectNoBlockedConsumer(node);
    await expectCursorsPast(node, ordinal);
    await until(
      "the outbox serves the marker",
      probed(node, () => capture.sentOpIds(REMOTE).has(marker.id)),
    );
    await until("the processor receives the marker", () =>
      processor.received.some(
        (op) => op.context.documentId === "x" && isPurgeMarker(op.operation),
      ),
    );
  });

  it("a sweep that fetched the id's operations before the purge committed inserts nothing", async () => {
    const node = a!;
    await create(node, "x");
    await lost(node, carries("x", "SET_MODEL_NAME"), () =>
      node.reactor.execute("x", "main", [setModelName({ name: "late" })]),
    );
    await remove(node, "x");

    const byOrdinals = gateAfterRead(
      node.module.operationIndex,
      "getByOrdinals",
      namesDocument("x"),
    );
    // A sweep claims the ordinal only once the shared cluster lets it settle.
    let entered = false;
    void byOrdinals.entered.then(() => {
      entered = true;
    });
    let sweeping: Promise<unknown> = Promise.resolve();
    let ordinal: number;
    try {
      await until(
        "a sweep fetches x's operations",
        async () => {
          if (entered) return true;
          sweeping = node.module.catchUp.sweepNow();
          await Promise.race([sweeping, byOrdinals.entered]);
          return entered;
        },
        15_000,
      );
      ({ ordinal } = await purge(node, "x"));
    } finally {
      byOrdinals.open();
      await sweeping;
    }
    await node.module.catchUp.sweepNow();

    await expectPurged(node.db, "x", { documentType: DOC_TYPE });
    expectNoBlockedConsumer(node);
    await expectCursorsPast(node, ordinal!);
  });

  it("a sweep replaying a drive's suffix with ADD_RELATIONSHIP to a purged child writes no Document or relationship row and does not block", async () => {
    const node = a!;
    await createDrive(node, "d");
    await create(node, "x");
    await create(node, "y");
    await lost(node, carries("d", "ADD_RELATIONSHIP"), () =>
      node.reactor.execute("d", "main", [
        addRelationshipAction("d", "y", "child"),
      ]),
    );
    await adopt(node, "d", "x");
    await remove(node, "x");
    const { ordinal } = await purge(node, "x");

    // The cluster's shared xmin can hold the watermark below the lost ordinal.
    const results: Awaited<ReturnType<typeof node.module.catchUp.sweepNow>> =
      [];
    const children = async () =>
      (
        await node.module.documentIndexer.getOutgoing("d", ["child"])
      ).results.map((edge) => edge.targetId);
    await until("a sweep indexes the lost relationship", async () => {
      results.push(...(await node.module.catchUp.sweepNow()));
      return (await children()).includes("y");
    });

    expect(results.filter((r) => r.blockedAt !== undefined)).toEqual([]);
    expect(await children()).toEqual(["y"]);
    await expectPurged(node.db, "x", { documentType: DOC_TYPE });
    expectNoBlockedConsumer(node);
    await expectCursorsPast(node, ordinal);
  });

  it("catchup rescan --from 0 after a purge leaves no rows for the id and no blocked cursor", async () => {
    const node = a!;
    await createDrive(node, "d");
    await create(node, "x");
    await adopt(node, "d", "x");
    await rename(node, "x", "named");
    await remove(node, "x");
    await purge(node, "x");
    await node.module.catchUp.sweepNow();

    await rescanCatchUp(node.db as unknown as Kysely<CatchUpAdminDatabase>, {
      from: 0,
      consumers: [],
      all: true,
      dryRun: false,
    });
    // A later write gives each cursor a move, so its compare-and-set runs.
    await create(node, "later");
    await node.module.catchUp.sweepNow();
    await node.module.catchUp.sweepNow();

    await expectPurged(node.db, "x", { documentType: DOC_TYPE });
    expectNoBlockedConsumer(node);
    const { head } = await readCatchUpStatus(
      node.db as unknown as Kysely<CatchUpAdminDatabase>,
    );
    await expectCursorsPast(node, head);
  });

  it("a restart with the marker above a model's cursor: boot replay applies it without error or rows", async () => {
    let node = a!;
    await createDrive(node, "d");
    await create(node, "x");
    await adopt(node, "d", "x");
    await remove(node, "x");
    await node.module.catchUp.sweepNow();

    const dropped = node.bus.dropWriteReadyFor("x");
    const { ordinal } = await purge(node, "x");
    await dropped;

    await stopNode(node);
    a = undefined;
    a = await buildNode({
      name: "a",
      db: pg,
      channelFactory: capture.factory(),
      maxConcurrency: 2,
    });
    node = a;

    await expectPurged(node.db, "x", { documentType: DOC_TYPE });
    expectNoBlockedConsumer(node);
    await node.module.catchUp.sweepNow();
    await expectCursorsPast(node, ordinal);
    expect(
      await node.module.documentView.exists(
        ["x"],
        DocumentExistence.IncludingDeleted,
      ),
    ).toEqual([true]);
  });

  it("a purge held open stalls the outbox for another document, which is served once it commits", async () => {
    const node = a!;
    await createDrive(node, "d");
    await create(node, "x");
    await create(node, "z");
    await adopt(node, "d", "x");
    await adopt(node, "d", "z");
    await capture.add(node, REMOTE, "d");
    await remove(node, "x");
    await until(
      "the remote has x's delete",
      probed(node, () =>
        capture
          .operations(REMOTE)
          .some(
            (op) =>
              op.context.documentId === "x" &&
              op.operation.action.type === "DELETE_DOCUMENT",
          ),
      ),
    );

    const hold = await holdIndexCommitOn(node, "x");
    let markerId: string;
    let zOpId: string;
    let purging: Promise<JobInfo> | undefined;
    try {
      purging = enqueuePurge(node, "x");
      await hold.waitUntilHeld();

      await rename(node, "z", "while-purging");
      const zOp = (
        await node.reactor.getOperations("z", {
          branch: "main",
          scopes: ["global"],
        })
      ).global!.results.at(-1)!;
      zOpId = zOp.id;
      const zOrdinal = Number(
        (
          await node.db
            .selectFrom("operation_index_operations")
            .select("ordinal")
            .where("opId", "=", zOpId)
            .executeTakeFirstOrThrow()
        ).ordinal,
      );

      expect(await node.module.settledWatermark.refresh()).toBeLessThan(
        zOrdinal,
      );
      await quiesce();
      expect(capture.sentOpIds(REMOTE).has(zOpId), "z withheld").toBe(false);

      await hold.release();
      await waitForJob(node.reactor, (await purging).id, [
        JobStatus.WRITE_READY,
        JobStatus.READ_READY,
        JobStatus.FAILED,
      ]);
    } finally {
      await hold.remove();
    }

    ({
      marker: { id: markerId },
    } = await expectPurged(node.db, "x", {
      documentType: DOC_TYPE,
    }));
    await until(
      "the outbox serves z's write",
      probed(node, () => capture.sentOpIds(REMOTE).has(zOpId)),
    );
    await until(
      "the outbox serves x's marker",
      probed(node, () => capture.sentOpIds(REMOTE).has(markerId)),
    );
  });
});
