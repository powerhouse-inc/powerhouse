import { afterEach, describe, expect, it, vi } from "vitest";
import type { SyncManager } from "../../../src/sync/sync-manager.js";
import { ChannelErrorSource } from "../../../src/sync/types.js";
import { syncOperationErrorType } from "../../../src/sync/utils.js";
import { create, Fleet, manifestFor, NARROW, WIDE } from "./fleet.js";

const V2 = { "base-reducer": 2, "test-protocol": 2 };

describe("a stored refusal of a base-reducer 2 document", () => {
  const fleet = new Fleet();

  afterEach(() => fleet.kill());

  it("is dropped, not reported again, when the dead letters reload", async () => {
    const a = await fleet.node("a", WIDE);
    const b = await fleet.node("b", NARROW);
    // B claims 2 without running it; A believes it.
    await fleet.link(a, b, "doc", {
      b: { announce: () => manifestFor(WIDE) },
    });

    await create(a, "doc", V2);

    const storage = b.module.syncModule!.deadLetterStorage;
    const stored = async () =>
      (await storage.list("b->a", { cursor: "0", limit: 10 })).results;
    await vi.waitFor(async () =>
      expect(await stored()).toEqual([
        expect.objectContaining({
          documentId: "doc",
          errorSource: ChannelErrorSource.Inbox,
          errorType: "UNSUPPORTED_PROTOCOL",
        }),
      ]),
    );

    // Reloads the channel's dead letters from storage, as a restart does.
    await (b.sync as SyncManager).resetChannel("b->a");

    const reloaded = b.sync.getByName("b->a").channel.deadLetter.items;
    expect(
      reloaded.filter(
        (item) => syncOperationErrorType(item.error) === "UNSUPPORTED_PROTOCOL",
      ),
    ).toEqual([]);
    await vi.waitFor(async () => expect(await stored()).toEqual([]));
  });
});
