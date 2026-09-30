import {
  ChannelError,
  ChannelErrorSource,
  MAX_POLLED_REFUSALS,
  supportsPurgeRefusals,
  SyncOperation,
} from "@powerhousedao/reactor";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ackThrough,
  addRemote,
  ADMIN,
  audit,
  createDrive,
  db,
  deleteOrdinal,
  type Env,
  events,
  item,
  refuseMarker,
  remove,
  setup,
  statusIs,
  sync,
  teardown,
  tickUntil,
} from "./utils/erasure.js";

afterEach(teardown);

/** What reactor-api's poll resolver hands the sync manager. */
async function pollRefusals(e: Env, remote: string, documentIds: string[]) {
  const manager = sync(e);
  if (!supportsPurgeRefusals(manager)) throw new Error("no refusal support");
  await manager.recordPolledMarkerRefusals(
    remote,
    documentIds.map((documentId) => ({ documentId, branch: "main" })),
  );
}

async function refusalRows(e: Env) {
  return db(e)
    .selectFrom("sync_purge_refusals")
    .select(["remote_name", "document_id"])
    .orderBy("document_id")
    .execute();
}

async function purgeAndAckMarker(e: Env, drive: string, remote: string) {
  await remove(e, drive);
  const { requestId } = await e.service.request([drive], {
    requestedBy: ADMIN,
  });
  await ackThrough(e, remote, await deleteOrdinal(e, drive));
  await tickUntil(e, "purged", statusIs(e, requestId, drive, "purged"));
  return requestId;
}

async function outcomeOf(e: Env, requestId: string) {
  return (await audit(e, requestId)).find(
    (row) => row.detail.kind === "outcome",
  );
}

describe("polled marker refusals [Postgres]", () => {
  it("keeps none from a remote the marker was not owed to", async () => {
    const e = await setup({ sync: true });
    const victim = await createDrive(e);
    const own = await createDrive(e);
    await addRemote(e, "poller", victim);
    await addRemote(e, "mallory", own);
    const junk = Array.from({ length: 200 }, (_, i) => `arbitrary-${i}`);

    await pollRefusals(e, "mallory", [victim, ...junk]);
    expect(await refusalRows(e)).toEqual([]);

    const requestId = await purgeAndAckMarker(e, victim, "poller");
    await pollRefusals(e, "mallory", [victim, own, ...junk]);
    expect(await refusalRows(e)).toEqual([]);

    await ackThrough(
      e,
      "poller",
      (await item(e, requestId, victim)).markerOrdinal!,
    );
    await tickUntil(e, "erased", statusIs(e, requestId, victim, "erased"));
    expect(await events(e, requestId, victim)).toContain("marker-converged");
  });

  it("keeps a bound remote's refusal of a tombstoned document", async () => {
    const e = await setup({ sync: true });
    const drive = await createDrive(e);
    await addRemote(e, "poller", drive);
    const requestId = await purgeAndAckMarker(e, drive, "poller");

    const past = Array.from(
      { length: MAX_POLLED_REFUSALS },
      (_, i) => `x-${i}`,
    );
    await pollRefusals(e, "poller", [...past, drive]);
    expect(await refusalRows(e)).toEqual([]);

    await pollRefusals(e, "poller", [drive, drive]);
    expect(await refusalRows(e)).toEqual([
      { remote_name: "poller", document_id: drive },
    ]);
    await ackThrough(
      e,
      "poller",
      (await item(e, requestId, drive)).markerOrdinal!,
    );
    await tickUntil(e, "erased", statusIs(e, requestId, drive, "erased"));
    expect((await outcomeOf(e, requestId))?.detail).toMatchObject({
      refused: ["poller"],
    });
  });

  it("does not count a stored refusal from a remote bound elsewhere", async () => {
    const e = await setup({ sync: true });
    const victim = await createDrive(e);
    const own = await createDrive(e);
    await addRemote(e, "poller", victim);
    await addRemote(e, "mallory", own);
    const requestId = await purgeAndAckMarker(e, victim, "poller");
    await db(e)
      .insertInto("sync_purge_refusals")
      .values({
        remote_name: "mallory",
        document_id: victim,
        branch: "main",
        refused_at_utc_ms: Date.now(),
      })
      .execute();

    await ackThrough(
      e,
      "poller",
      (await item(e, requestId, victim)).markerOrdinal!,
    );
    await tickUntil(e, "erased", statusIs(e, requestId, victim, "erased"));
    expect(await events(e, requestId, victim)).toContain("marker-converged");
    expect(
      (await audit(e, requestId)).filter(
        (row) => row.detail.kind === "refusal",
      ),
    ).toEqual([]);
  });
});

describe("remote dead letters of a purged document [Postgres]", () => {
  it("persists only a marker refusal, not a dead letter of another type", async () => {
    const e = await setup({ sync: true });
    const drive = await createDrive(e);
    await addRemote(e, "poller", drive);
    await remove(e, drive);
    const { requestId } = await e.service.request([drive], {
      requestedBy: ADMIN,
    });
    await ackThrough(e, "poller", await deleteOrdinal(e, drive));
    await tickUntil(e, "purged", statusIs(e, requestId, drive, "purged"));

    // What handleRemoteDeadLetters builds for a server-reported conflict.
    const conflict = new SyncOperation(
      crypto.randomUUID(),
      "job",
      [],
      "poller",
      drive,
      ["document"],
      "main",
      [],
    );
    conflict.failed(
      new ChannelError(
        ChannelErrorSource.Outbox,
        new Error("Operation conflicts with remote state"),
        undefined,
      ),
    );
    const recorded = vi.spyOn(sync(e) as never, "recordPurgeRefusal");
    const channel = sync(e).getByName("poller").channel;
    channel.deadLetter.add(conflict);
    expect(channel.deadLetter.items).toEqual([]);
    expect(recorded).not.toHaveBeenCalled();

    await refuseMarker(e, "poller", drive);
    expect(recorded).toHaveBeenCalledTimes(1);
    const rows = await db(e)
      .selectFrom("sync_purge_refusals")
      .select(["remote_name", "document_id"])
      .execute();
    expect(rows).toEqual([{ remote_name: "poller", document_id: drive }]);
  });
});
