import { PGlite } from "@electric-sql/pglite";
import { Kysely } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../../../src/core/types.js";
import { HardenedPGliteDialect } from "../../../src/storage/kysely/pglite-dialect.js";
import { ChannelError } from "../../../src/sync/errors.js";
import type { SyncManager } from "../../../src/sync/sync-manager.js";
import { SyncOperation } from "../../../src/sync/sync-operation.js";
import { ChannelErrorSource } from "../../../src/sync/types.js";
import { syncOperationErrorType } from "../../../src/sync/utils.js";
import {
  create,
  Fleet,
  has,
  manifestFor,
  NARROW,
  WIDE,
  type Node,
} from "./fleet.js";

const V2 = { "base-reducer": 2, "test-protocol": 2 };

/** What GqlRequestChannel makes of the receiver's refusal on its next poll. */
function reportRefusal(fleet: Fleet, remoteName: string, documentId: string) {
  const reported = new SyncOperation(
    `reported-${documentId}`,
    `job-${documentId}`,
    [],
    remoteName,
    documentId,
    ["document"],
    "main",
    [],
  );
  reported.failed(
    new ChannelError(
      ChannelErrorSource.Outbox,
      new Error("refused"),
      "UNSUPPORTED_PROTOCOL",
    ),
  );
  fleet.channels.get(remoteName)!.deadLetter.add(reported);
}

async function storedRefusals(node: Node) {
  const page = await node.module.syncModule!.deadLetterStorage.list(
    `${node.name}->a`,
    { cursor: "0", limit: 10 },
  );
  return page.results.filter(
    (record) =>
      record.errorSource === ChannelErrorSource.Inbox &&
      record.errorType === "UNSUPPORTED_PROTOCOL",
  );
}

describe("a stored refusal of a base-reducer 2 document", () => {
  const fleet = new Fleet();
  const dbs: Kysely<Database>[] = [];

  afterEach(async () => {
    fleet.kill();
    for (const db of dbs.splice(0)) await db.destroy();
  });

  it("is kept while this reactor cannot run the document, and dropped once it can", async () => {
    const db = new Kysely<Database>({
      dialect: new HardenedPGliteDialect(new PGlite()),
    });
    dbs.push(db);
    const a = await fleet.node("a", WIDE);
    const b = await fleet.node("b", NARROW, db);
    // B claims 2 without running it; A believes it.
    await fleet.link(a, b, "doc", {
      b: { announce: () => manifestFor(WIDE) },
    });

    await create(a, "doc", V2);

    await vi.waitFor(async () =>
      expect(await storedRefusals(b)).toEqual([
        expect.objectContaining({ documentId: "doc" }),
      ]),
    );

    // Reloads the dead letters from storage; B still cannot run the document.
    await (b.sync as SyncManager).resetChannel("b->a");

    const reloaded = b.sync.getByName("b->a").channel.deadLetter.items;
    expect(
      reloaded.map((item) => [
        item.documentId,
        syncOperationErrorType(item.error),
      ]),
    ).toEqual([["doc", "UNSUPPORTED_PROTOCOL"]]);
    expect(await storedRefusals(b)).toHaveLength(1);

    reportRefusal(fleet, "a->b", "doc");
    await vi.waitFor(async () =>
      expect(await a.sync.listHolds({ remoteName: "a->b" })).toHaveLength(1),
    );

    // B restarts on the same store, now running 2, and announces it.
    await b.reactor.kill().completed;
    const upgraded = await fleet.node("b", WIDE, db);
    const channel = fleet.channels.get("b->a")!;
    channel.options.announce = undefined;
    channel.reannounce();

    await vi.waitFor(async () => expect(await has(upgraded, "doc")).toBe(true));
    expect(await storedRefusals(upgraded)).toEqual([]);
    expect(
      upgraded.sync
        .getByName("b->a")
        .channel.deadLetter.items.map((item) => item.documentId),
    ).toEqual([]);
    expect(await a.sync.listHolds({ remoteName: "a->b" })).toEqual([]);
  });
});
