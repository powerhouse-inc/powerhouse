import { type OperationWithContext } from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { SyncOperationStatus } from "../../../src/sync/types.js";
import {
  createHarness,
  emitWriteReady,
  FILTER,
  FULL_MANIFEST,
  indexOperation,
  purgeInIndex,
  type Harness,
} from "./harness.js";

const DOC = "purged-doc";
const COL_A = DriveCollectionId.forDrive("drive-a");
const POLLING = { type: "polling", parameters: {} };

describe("a purged id's rows already taken for serving [Postgres]", () => {
  let harness: Harness;

  afterEach(async () => {
    await harness.cleanup();
  });

  it("leave the outbox when the id is tombstoned; only the marker is served", async () => {
    harness = await createHarness({ polling: true });
    await harness.manager.startup();
    const { manager, index, db, eventBus } = harness;
    await indexOperation(index, DOC, { joins: [COL_A.key] });
    await indexOperation(index, DOC, { joins: [COL_A.key], scope: "local" });
    await manager.add("p", COL_A, POLLING, FILTER, {}, "p", FULL_MANIFEST);
    const outbox = manager.getByName("p").channel.outbox;
    await vi.waitFor(() => expect(outbox.items).toHaveLength(2));

    // One emitted in a poll whose response was lost, one in flight.
    const [emitted, inFlight] = outbox.items;
    emitted.emittedCount = emitted.operations.length;
    inFlight.started();
    const stale: OperationWithContext[] = [
      ...emitted.operations,
      ...inFlight.operations,
    ];

    const { entry } = await purgeInIndex(db, index, DOC);
    await emitWriteReady(eventBus, [entry], { [DOC]: [COL_A.key] });

    await vi.waitFor(() =>
      expect(
        outbox.items
          .flatMap((item) => item.operations)
          .map((op) => op.operation.id),
      ).toEqual([entry.operation.id]),
    );
    expect(emitted.status).toBe(SyncOperationStatus.Applied);
    expect(inFlight.status).toBe(SyncOperationStatus.Applied);
    // Applied, so the served cursor moves past what is gone.
    const highest = Math.max(...stale.map((op) => op.context.ordinal));
    await vi.waitFor(async () =>
      expect(
        (await harness.storage.syncCursorStorage.get("p", "outbox"))
          .cursorOrdinal,
      ).toBe(highest),
    );
  });
});
