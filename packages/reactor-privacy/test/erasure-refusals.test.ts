import {
  ChannelError,
  ChannelErrorSource,
  SyncOperation,
} from "@powerhousedao/reactor";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ackThrough,
  addRemote,
  ADMIN,
  createDrive,
  db,
  deleteOrdinal,
  refuseMarker,
  remove,
  setup,
  statusIs,
  sync,
  teardown,
  tickUntil,
} from "./utils/erasure.js";

afterEach(teardown);

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
