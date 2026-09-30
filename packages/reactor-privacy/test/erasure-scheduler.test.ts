import { DriveCollectionId, JobStatus, PURGE_NS } from "@powerhousedao/reactor";
import { setDriveName } from "@powerhousedao/shared/document-drive";
import { sql } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createModuleErasure,
  ErasureScheduler,
  ErasureSignerMissingError,
  registerSubjectDocumentsReadModel,
} from "../index.js";
import { DroppingEventBus } from "./utils/dropping-event-bus.js";
import {
  ackThrough,
  addRemote,
  ADMIN,
  audit,
  createDoc,
  createDrive,
  db,
  deleteOrdinal,
  events,
  expectNoIdentifiers,
  HOUR,
  IDENTIFIER,
  item,
  MANIFEST_WITHOUT_PURGE,
  refuseMarker,
  remove,
  restart,
  SECRET,
  served,
  setup,
  statusIs,
  sync,
  teardown,
  tickUntil,
} from "./utils/erasure.js";
import { signedBy } from "./utils/p256-signer.js";
import { failingInitChannels, settled } from "./utils/reactor.js";

afterEach(teardown);

describe("erasure scheduling [Postgres]", () => {
  it("refuses to start with no reactor signer", async () => {
    const e = await setup();
    expect(() =>
      createModuleErasure(e.host.module, {
        deploymentSecret: SECRET,
        signer: undefined,
      }),
    ).toThrow(ErasureSignerMissingError);
    const passthrough = {
      publicKey: {} as CryptoKey,
      sign: () => Promise.resolve(new Uint8Array(0)),
      verify: () => Promise.resolve(),
      signAction: () => Promise.resolve(["", "", "", "", ""]),
    };
    expect(() =>
      createModuleErasure(e.host.module, {
        deploymentSecret: SECRET,
        signer: passthrough as never,
      }),
    ).toThrow(ErasureSignerMissingError);
  });

  it("waits while a remote is owed the delete and enqueues on acknowledgement", async () => {
    const e = await setup({ sync: true });
    const doc = await createDoc(e);
    const drive = await createDrive(e, [doc]);
    await addRemote(e, "poller", drive);
    await remove(e, doc);
    const { requestId } = await e.service.request([doc], {
      requestedBy: ADMIN,
    });

    await e.scheduler.tick();
    await e.scheduler.tick();
    expect((await item(e, requestId, doc)).status).toBe("waiting");
    const waiting = (await audit(e, requestId)).filter(
      (row) => row.event === "waiting",
    );
    expect(waiting).toHaveLength(1);
    expect(waiting[0]!.detail).toMatchObject({
      stage: "delete",
      pending: [{ remote: "poller" }],
    });

    await ackThrough(e, "poller", await deleteOrdinal(e, doc));
    await tickUntil(e, "purged", statusIs(e, requestId, doc, "purged"));
    const trail = (await audit(e, requestId)).filter(
      (row) => row.documentId === doc,
    );
    expect(trail.map((row) => [row.event, row.detail.stage])).toEqual([
      ["waiting", "delete"],
      ["purged", undefined],
      ["waiting", "marker"],
    ]);
  });

  it("enqueues at the deadline with deadline-passed recorded", async () => {
    const e = await setup({ sync: true });
    const doc = await createDoc(e);
    const drive = await createDrive(e, [doc]);
    await addRemote(e, "poller", drive);
    await remove(e, doc);
    const { requestId } = await e.service.request([doc], {
      requestedBy: ADMIN,
      deadline: new Date(e.now().getTime() + HOUR),
    });

    await e.scheduler.tick();
    expect((await item(e, requestId, doc)).status).toBe("waiting");
    e.advance(2 * HOUR);
    await e.scheduler.tick();
    expect((await item(e, requestId, doc)).status).toBe("purging");
    const passed = (await audit(e, requestId)).find(
      (row) => row.event === "deadline-passed",
    );
    expect(passed?.detail.pending?.map((p) => p.remote)).toEqual(["poller"]);
    await tickUntil(e, "purged", statusIs(e, requestId, doc, "purged"));
  });

  it("fails closed with no sync manager while sync_remotes has rows", async () => {
    const e = await setup();
    const doc = await createDoc(e);
    await remove(e, doc);
    await db(e)
      .insertInto("sync_remotes")
      .values({
        name: "orphan",
        collection_id: "c-1",
        channel_type: "gql",
      } as never)
      .execute();
    const { requestId } = await e.service.request([doc], {
      requestedBy: ADMIN,
      deadline: new Date(e.now().getTime() + HOUR),
    });

    await e.scheduler.tick();
    await e.scheduler.tick();
    expect((await item(e, requestId, doc)).status).toBe("waiting");
    const waiting = (await audit(e, requestId)).find(
      (row) => row.event === "waiting",
    );
    expect(waiting?.detail.pending).toEqual([
      { remote: "orphan", state: "unknown" },
    ]);
    expect(typeof waiting?.detail.unknown).toBe("string");

    e.advance(2 * HOUR);
    await tickUntil(e, "purged", statusIs(e, requestId, doc, "purged"));
    expect(await events(e, requestId, doc)).toContain("deadline-passed");
  });

  it("keeps only one item purging at a time across two requests", async () => {
    const e = await setup();
    const first = await createDoc(e);
    const second = await createDoc(e);
    await remove(e, first);
    await remove(e, second);
    const r1 = await e.service.request([first], { requestedBy: ADMIN });
    const r2 = await e.service.request([second], { requestedBy: ADMIN });

    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });
    // A session lock: no open transaction holds back other suites' watermark.
    const key = sql`${sql.lit(PURGE_NS)}, hashtext(${first}) & 1023`;
    const holder = db(e)
      .connection()
      .execute(async (conn) => {
        await sql`select pg_advisory_lock(${key})`.execute(conn);
        locked();
        await released;
        await sql`select pg_advisory_unlock(${key})`.execute(conn);
      });
    await lockTaken;

    const purging = async () =>
      (
        await db(e)
          .selectFrom("erasure_items")
          .select("documentId")
          .where("status", "=", "purging")
          .execute()
      ).map((row: { documentId: string }) => row.documentId);

    try {
      await e.scheduler.tick();
      expect(await purging()).toEqual([first]);
      for (let i = 0; i < 3; i++) {
        await e.scheduler.tick();
        expect(await purging()).toEqual([first]);
        expect((await item(e, r2.requestId, second)).status).toBe("waiting");
      }
    } finally {
      release();
      await holder;
    }

    await tickUntil(
      e,
      "both purged",
      async () =>
        (await item(e, r1.requestId, first)).status !== "waiting" &&
        (await item(e, r2.requestId, second)).status === "erased",
    );
    expect((await item(e, r1.requestId, first)).status).toBe("erased");
  });

  it("moves to purged from the tombstone when JOB_WRITE_READY was dropped", async () => {
    const bus = new DroppingEventBus();
    const e = await setup({ eventBus: bus });
    const doc = await createDoc(e);
    await remove(e, doc);
    const dropped = bus.dropWriteReadyFor(doc);
    const { requestId } = await e.service.request([doc], {
      requestedBy: ADMIN,
    });

    await e.scheduler.tick();
    expect((await item(e, requestId, doc)).status).toBe("purging");
    await dropped;
    await tickUntil(e, "purged", async () =>
      (await events(e, requestId, doc)).includes("purged"),
    );
    expect((await item(e, requestId, doc)).markerOrdinal).toBeGreaterThan(0);
    const jobs = [
      ...(
        e.host.module.jobTracker as unknown as {
          jobs: Map<
            string,
            { status: JobStatus; meta: { purgeRequestId?: string } }
          >;
        }
      ).jobs.values(),
    ].filter((job) => job.meta.purgeRequestId === requestId);
    expect(jobs.map((job) => job.status)).toEqual([JobStatus.RUNNING]);
  });

  it("moves to purged from the tombstone after a restart, and re-enqueues a lost job", async () => {
    const e = await setup();
    const done = await createDoc(e);
    const lost = await createDoc(e);
    await remove(e, done);
    await remove(e, lost);
    const { requestId } = await e.service.request([done], {
      requestedBy: ADMIN,
    });
    await e.scheduler.tick();
    await vi.waitUntil(
      async () =>
        (await db(e)
          .selectFrom("document_purges")
          .select("documentId")
          .where("documentId", "=", done)
          .executeTakeFirst()) !== undefined,
      { timeout: 20_000, interval: 20 },
    );

    const restarted = createModuleErasure(e.host.module, {
      deploymentSecret: SECRET,
      signer: e.signer,
      permissions: e.eraser,
      now: e.now,
    });
    await restarted.scheduler.tick();
    expect((await item(e, requestId, done)).status).not.toBe("purging");
    expect(await events(e, requestId, done)).toContain("purged");

    const second = await e.service.request([lost], { requestedBy: ADMIN });
    await db(e)
      .updateTable("erasure_items")
      .set({ status: "purging" })
      .where("requestId", "=", second.requestId)
      .execute();
    await vi.waitUntil(
      async () => {
        await restarted.scheduler.tick();
        return (await item(e, second.requestId, lost)).status === "erased";
      },
      { timeout: 20_000, interval: 50 },
    );
    await restarted.scheduler.stop();
  });

  it("fails the item and the request on a failed purge job", async () => {
    const e = await setup({ maxPurgeOperations: 1 });
    const doc = await createDoc(e);
    await remove(e, doc);
    const plan = await e.service.plan([doc]);
    expect(plan.maxPurgeOperations).toBe(1);
    expect(plan.items[0]!.operationCount).toBeGreaterThan(1);

    const { requestId } = await e.service.request([doc], {
      requestedBy: ADMIN,
    });
    await tickUntil(e, "failed", statusIs(e, requestId, doc, "failed"));
    const failed = await item(e, requestId, doc);
    expect(failed.lastError).toMatch(/^PurgeTooLargeError: /);
    await e.scheduler.tick();
    const request = await e.service.status(requestId);
    expect(request.status).toBe("failed");
    expect(await events(e, requestId, doc)).toEqual(["failed"]);
    expect(await events(e, requestId, null)).toEqual(["requested", "failed"]);
  });
});

describe("after the purge [Postgres]", () => {
  it("keeps remotes and permissions until the marker converges; the remote gets it first", async () => {
    const e = await setup({ sync: true });
    await registerSubjectDocumentsReadModel(e.host.module, {
      deploymentSecret: SECRET,
    });
    const doc = await createDoc(e);
    const drive = await createDrive(e, [doc]);
    await addRemote(e, "poller", drive);
    const rename = await e.host.module.reactor.execute(drive, "main", [
      await signedBy(e.signer, setDriveName({ name: "signed" }), drive),
    ]);
    await settled(e.host.module, rename.id);
    await remove(e, doc);
    await remove(e, drive);
    await vi.waitUntil(
      async () =>
        (
          await db(e)
            .selectFrom("subject_documents")
            .select("documentId")
            .where("documentId", "=", drive)
            .execute()
        ).length > 0,
      { timeout: 10_000, interval: 20 },
    );
    const { requestId } = await e.service.request([drive], {
      requestedBy: ADMIN,
    });
    await ackThrough(e, "poller", await deleteOrdinal(e, drive));

    await tickUntil(
      e,
      "both purged",
      async () =>
        (await statusIs(e, requestId, doc, "purged")()) &&
        (await statusIs(e, requestId, drive, "purged")()),
    );
    for (let i = 0; i < 3; i++) await e.scheduler.tick();
    expect((await item(e, requestId, doc)).status).toBe("purged");
    expect((await item(e, requestId, drive)).status).toBe("purged");
    expect(e.eraser.calls).toEqual([]);
    expect(
      sync(e)
        .list()
        .map((r) => r.meta.name),
    ).toEqual(["poller"]);

    const docMarker = (await item(e, requestId, doc)).markerOrdinal!;
    const driveMarker = (await item(e, requestId, drive)).markerOrdinal!;
    expect(driveMarker).toBeGreaterThan(docMarker);
    await ackThrough(e, "poller", docMarker);
    await tickUntil(e, "doc erased", statusIs(e, requestId, doc, "erased"));
    expect(e.eraser.calls).toEqual([doc]);
    expect((await item(e, requestId, drive)).status).toBe("purged");
    expect(
      sync(e)
        .list()
        .map((r) => r.meta.name),
    ).toEqual(["poller"]);
    expect(
      served(e, "poller").some(
        (op) =>
          op.context.ordinal === driveMarker &&
          op.operation.action.type === "PURGE_DOCUMENT",
      ),
    ).toBe(true);

    await ackThrough(e, "poller", driveMarker);
    await tickUntil(e, "drive erased", statusIs(e, requestId, drive, "erased"));
    expect(sync(e).list()).toEqual([]);
    expect(e.eraser.calls).toEqual([doc, drive]);
    await e.scheduler.tick();
    expect((await e.service.status(requestId)).status).toBe("complete");
    expect(await events(e, requestId, drive)).toEqual([
      "expanded",
      "purged",
      "waiting",
      "marker-converged",
      "remotes-removed",
      "permissions-erased",
    ]);
    const removed = (await audit(e, requestId)).find(
      (row) => row.event === "remotes-removed" && row.documentId === drive,
    );
    expect(removed?.detail).toEqual({ remotes: ["poller"] });
    expect(await events(e, requestId, null)).toEqual(["requested", "complete"]);

    const indexed = await db(e)
      .selectFrom("subject_documents")
      .select("documentId")
      .where("documentId", "in", [doc, drive])
      .execute();
    expect(indexed).toEqual([]);
    await expectNoIdentifiers(e);
  });

  it("records a held remote marker-undelivered and removes it at markerGrace", async () => {
    const e = await setup({ sync: true, markerGraceMs: HOUR });
    const drive = await createDrive(e);
    await addRemote(e, "old-peer", drive, MANIFEST_WITHOUT_PURGE);
    await remove(e, drive);
    const { requestId } = await e.service.request([drive], {
      requestedBy: ADMIN,
    });
    await ackThrough(e, "old-peer", await deleteOrdinal(e, drive));

    await tickUntil(e, "held reported", async () =>
      (await audit(e, requestId)).some(
        (row) =>
          row.event === "waiting" &&
          row.detail.stage === "marker" &&
          (row.detail.pending ?? []).some(
            (p) => p.remote === "old-peer" && p.state === "held",
          ),
      ),
    );
    expect((await item(e, requestId, drive)).status).toBe("purged");
    expect(
      sync(e)
        .list()
        .map((r) => r.meta.name),
    ).toEqual(["old-peer"]);

    e.advance(2 * HOUR);
    await tickUntil(e, "erased", statusIs(e, requestId, drive, "erased"));
    const outcome = (await audit(e, requestId)).find(
      (row) => row.event === "marker-undelivered",
    );
    expect(outcome?.detail).toMatchObject({
      kind: "outcome",
      pending: [{ remote: "old-peer", state: "held" }],
      markerGraceExpired: true,
    });
    expect(sync(e).list()).toEqual([]);
  });

  it("records a remote that refused the marker marker-undelivered", async () => {
    const e = await setup({ sync: true });
    e.scheduler.start();
    const drive = await createDrive(e);
    await addRemote(e, "refuser", drive);
    await remove(e, drive);
    const { requestId } = await e.service.request([drive], {
      requestedBy: ADMIN,
    });
    await ackThrough(e, "refuser", await deleteOrdinal(e, drive));
    await tickUntil(e, "purged", statusIs(e, requestId, drive, "purged"));

    await refuseMarker(
      e,
      "refuser",
      drive,
      `signer ${ADMIN} is not trusted by ${e.signer.did}`,
    );
    await ackThrough(
      e,
      "refuser",
      (await item(e, requestId, drive)).markerOrdinal!,
    );

    await tickUntil(e, "erased", statusIs(e, requestId, drive, "erased"));
    const rows = (await audit(e, requestId)).filter(
      (row) => row.event === "marker-undelivered",
    );
    expect(rows.map((row) => row.detail.kind)).toEqual(["refusal", "outcome"]);
    expect(rows[1]!.detail).toMatchObject({ refused: ["refuser"] });
    expect(await events(e, requestId, drive)).not.toContain("marker-converged");
    await expectNoIdentifiers(e);
  });

  it("retries the permission erase across ticks until it succeeds", async () => {
    const e = await setup();
    const doc = await createDoc(e);
    await remove(e, doc);
    e.eraser.failures = 2;
    const { requestId } = await e.service.request([doc], {
      requestedBy: ADMIN,
    });
    await tickUntil(e, "a failed erase", () =>
      Promise.resolve(e.eraser.calls.length > 0),
    );
    const failing = await item(e, requestId, doc);
    expect(failing.status).toBe("purged");
    expect(failing.lastError).toMatch(/hmac:[0-9a-f]{64}/);
    expect(failing.lastError).not.toMatch(IDENTIFIER);
    await tickUntil(e, "erased", statusIs(e, requestId, doc, "erased"));
    expect(e.eraser.calls).toEqual([doc, doc, doc]);
    expect(
      (await events(e, requestId, doc)).filter(
        (event) => event === "permissions-erased",
      ),
    ).toHaveLength(1);
    await expectNoIdentifiers(e);
  });
});

describe("remotes the sync manager has not loaded [Postgres]", () => {
  it("does not count a stored remote whose channel failed to start as converged", async () => {
    const e = await setup({ sync: true });
    const doc = await createDoc(e);
    const drive = await createDrive(e, [doc]);
    await addRemote(e, "poller", drive);
    await remove(e, doc);
    await restart(e, { channelFactory: failingInitChannels() });
    expect(sync(e).list()).toEqual([]);

    const { requestId } = await e.service.request([doc], {
      requestedBy: ADMIN,
      deadline: new Date(e.now().getTime() + HOUR),
    });
    await e.scheduler.tick();
    await e.scheduler.tick();
    expect((await item(e, requestId, doc)).status).toBe("waiting");
    const waiting = (await audit(e, requestId)).find(
      (row) => row.event === "waiting",
    );
    expect(waiting?.detail.pending).toEqual([
      { remote: "poller", state: "unknown" },
    ]);

    e.advance(2 * HOUR);
    await tickUntil(e, "purged", statusIs(e, requestId, doc, "purged"));
    for (let i = 0; i < 3; i++) await e.scheduler.tick();
    expect((await item(e, requestId, doc)).status).toBe("purged");

    e.advance(8 * 24 * HOUR);
    await tickUntil(e, "erased", statusIs(e, requestId, doc, "erased"));
    const trail = await events(e, requestId, doc);
    expect(trail).not.toContain("marker-converged");
    const outcome = (await audit(e, requestId)).find(
      (row) => row.event === "marker-undelivered",
    );
    expect(outcome?.detail).toMatchObject({
      pending: [{ remote: "poller", state: "unknown" }],
      markerGraceExpired: true,
    });
  });

  it("deletes a drive's stored remote that is not loaded at markerGrace, not before", async () => {
    const e = await setup({ sync: true });
    const drive = await createDrive(e);
    await addRemote(e, "poller", drive);
    await remove(e, drive);
    await restart(e, { channelFactory: failingInitChannels() });
    const stored = () =>
      db(e)
        .selectFrom("sync_remotes")
        .select("name")
        .execute()
        .then((rows) => rows.map((row) => row.name));

    const { requestId } = await e.service.request([drive], {
      requestedBy: ADMIN,
      deadline: new Date(e.now().getTime() + HOUR),
    });
    e.advance(2 * HOUR);
    await tickUntil(e, "purged", statusIs(e, requestId, drive, "purged"));
    for (let i = 0; i < 3; i++) await e.scheduler.tick();
    expect((await item(e, requestId, drive)).status).toBe("purged");
    expect(await stored()).toEqual(["poller"]);

    e.advance(8 * 24 * HOUR);
    await tickUntil(e, "erased", statusIs(e, requestId, drive, "erased"));
    expect(await stored()).toEqual([]);
    const removed = (await audit(e, requestId)).find(
      (row) => row.event === "remotes-removed",
    );
    expect(removed?.detail).toEqual({
      remotes: [],
      deletedFromStorage: ["poller"],
    });
  });

  it("deletes a drive's stored remote at markerGrace with no sync manager", async () => {
    const e = await setup({ markerGraceMs: 3 * HOUR });
    const drive = await createDrive(e);
    await remove(e, drive);
    await db(e)
      .insertInto("sync_remotes")
      .values({
        name: "orphan",
        collection_id: DriveCollectionId.forDrive(drive).key,
        channel_type: "gql",
        bound_address: ADMIN.toLowerCase(),
      } as never)
      .execute();
    const { requestId } = await e.service.request([drive], {
      requestedBy: ADMIN,
      deadline: new Date(e.now().getTime() + HOUR),
    });
    e.advance(2 * HOUR);
    await tickUntil(e, "purged", statusIs(e, requestId, drive, "purged"));
    await e.scheduler.tick();
    expect((await item(e, requestId, drive)).status).toBe("purged");
    expect(
      await db(e).selectFrom("sync_remotes").select("name").execute(),
    ).toEqual([{ name: "orphan" }]);

    e.advance(4 * HOUR);
    await tickUntil(e, "erased", statusIs(e, requestId, drive, "erased"));
    const rows = await db(e).selectFrom("sync_remotes").selectAll().execute();
    expect(rows).toEqual([]);
  });
});

describe("recovering from lost signals [Postgres]", () => {
  it("records a refusal reported while the scheduler was stopped", async () => {
    const e = await setup({ sync: true });
    const drive = await createDrive(e);
    await addRemote(e, "refuser", drive);
    await remove(e, drive);
    const { requestId } = await e.service.request([drive], {
      requestedBy: ADMIN,
    });
    await ackThrough(e, "refuser", await deleteOrdinal(e, drive));
    await tickUntil(e, "purged", statusIs(e, requestId, drive, "purged"));

    await refuseMarker(e, "refuser", drive);
    await ackThrough(
      e,
      "refuser",
      (await item(e, requestId, drive)).markerOrdinal!,
    );
    await restart(e);
    await tickUntil(e, "erased", statusIs(e, requestId, drive, "erased"));
    expect(await events(e, requestId, drive)).not.toContain("marker-converged");
    const outcome = (await audit(e, requestId)).find(
      (row) =>
        row.event === "marker-undelivered" && row.detail.kind === "outcome",
    );
    expect(outcome?.detail).toMatchObject({ refused: ["refuser"] });
  });

  it("moves a failed item to purged when its timed-out purge commits later", async () => {
    const e = await setup();
    const doc = await createDoc(e);
    await remove(e, doc);
    const scheduler = new ErasureScheduler({
      db: db(e),
      deploymentSecret: SECRET,
      signer: e.signer,
      purges: {
        enqueuePurge: () => Promise.resolve([{ id: "zombie" } as never]),
      },
      jobs: {
        getJobStatus: () =>
          ({
            id: "zombie",
            status: JobStatus.FAILED,
            error: { name: "Error", message: "The operation timed out." },
          }) as never,
      },
      permissions: e.eraser,
    });
    const { requestId } = await e.service.request([doc], {
      requestedBy: ADMIN,
    });
    for (let i = 0; i < 3; i++) await scheduler.tick();
    expect((await item(e, requestId, doc)).status).toBe("failed");
    expect((await e.service.status(requestId)).status).toBe("failed");

    await e.host.module.documentPurgeService.enqueuePurge([doc], requestId);
    await vi.waitUntil(async () => (await tombstoneOf(e, doc)) !== undefined, {
      timeout: 20_000,
    });
    for (let i = 0; i < 3; i++) await scheduler.tick();

    expect({
      status: (await item(e, requestId, doc)).status,
      erased: e.eraser.calls,
      request: (await e.service.status(requestId)).status,
    }).toEqual({ status: "erased", erased: [doc], request: "complete" });
    expect(await events(e, requestId, null)).toEqual([
      "requested",
      "failed",
      "reopened",
      "complete",
    ]);
  });

  it("waits for a failed purge's transaction to end before the next purge", async () => {
    const e = await setup();
    const first = await createDoc(e);
    const second = await createDoc(e);
    await remove(e, first);
    await remove(e, second);
    let failFirst = true;
    const scheduler = new ErasureScheduler({
      db: db(e),
      deploymentSecret: SECRET,
      signer: e.signer,
      purges: {
        enqueuePurge: (ids, requestId, options) =>
          ids[0] === first
            ? Promise.resolve([{ id: "zombie" } as never])
            : e.host.module.documentPurgeService.enqueuePurge(
                ids,
                requestId,
                options,
              ),
      },
      jobs: {
        getJobStatus: (id) =>
          id === "zombie" && failFirst
            ? ({
                id,
                status: JobStatus.FAILED,
                error: { name: "Error", message: "timed out" },
              } as never)
            : e.host.module.jobTracker.getJobStatus(id),
      },
      permissions: e.eraser,
    });
    const r1 = await e.service.request([first], { requestedBy: ADMIN });
    const r2 = await e.service.request([second], { requestedBy: ADMIN });

    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });
    // The timed-out purge's transaction, still holding its lock.
    const key = sql`${sql.lit(PURGE_NS)}, hashtext(${first}) & 1023`;
    const holder = db(e)
      .connection()
      .execute(async (conn) => {
        await sql`select pg_advisory_lock(${key})`.execute(conn);
        locked();
        await released;
        await sql`select pg_advisory_unlock(${key})`.execute(conn);
      });
    await lockTaken;
    try {
      for (let i = 0; i < 3; i++) await scheduler.tick();
      expect((await item(e, r1.requestId, first)).status).toBe("failed");
      for (let i = 0; i < 3; i++) {
        await scheduler.tick();
        expect((await item(e, r2.requestId, second)).status).toBe("waiting");
      }
    } finally {
      release();
      await holder;
    }
    failFirst = false;
    await vi.waitUntil(
      async () => {
        await scheduler.tick();
        return (await item(e, r2.requestId, second)).status === "erased";
      },
      { timeout: 20_000, interval: 50 },
    );
  });

  it("enqueues a purge again when it has no tombstone past the purge timeout", async () => {
    const e = await setup();
    const doc = await createDoc(e);
    await remove(e, doc);
    const enqueued: string[] = [];
    const scheduler = new ErasureScheduler({
      db: db(e),
      deploymentSecret: SECRET,
      signer: e.signer,
      purges: {
        enqueuePurge: (ids, requestId, options) => {
          enqueued.push(ids[0]!);
          return enqueued.length === 1
            ? Promise.resolve([{ id: "stuck" } as never])
            : e.host.module.documentPurgeService.enqueuePurge(
                ids,
                requestId,
                options,
              );
        },
      },
      jobs: {
        getJobStatus: (id) =>
          id === "stuck"
            ? ({ id, status: JobStatus.RUNNING } as never)
            : e.host.module.jobTracker.getJobStatus(id),
      },
      permissions: e.eraser,
      purgeTimeoutMs: HOUR,
      now: e.now,
    });
    const { requestId } = await e.service.request([doc], {
      requestedBy: ADMIN,
    });
    for (let i = 0; i < 3; i++) await scheduler.tick();
    expect(enqueued).toEqual([doc]);
    expect((await item(e, requestId, doc)).status).toBe("purging");

    e.advance(2 * HOUR);
    await vi.waitUntil(
      async () => {
        await scheduler.tick();
        return (await item(e, requestId, doc)).status === "erased";
      },
      { timeout: 20_000, interval: 50 },
    );
    expect(enqueued).toEqual([doc, doc]);
  });
});

async function tombstoneOf(e: Parameters<typeof db>[0], id: string) {
  return db(e)
    .selectFrom("document_purges")
    .select("documentId")
    .where("documentId", "=", id)
    .executeTakeFirst();
}
