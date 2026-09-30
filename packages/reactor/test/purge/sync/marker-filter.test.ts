import { afterEach, describe, expect, it, vi } from "vitest";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { type RemoteFilter } from "../../../src/sync/types.js";
import {
  createHarness,
  emitWriteReady,
  FULL_MANIFEST,
  indexOperation,
  MANIFEST_WITHOUT_PURGE,
  purgeInIndex,
  sentOperations,
  type Harness,
} from "./harness.js";

const DOC = "purged-doc";
const OTHER = "other-doc";
const COL_A = DriveCollectionId.forDrive("drive-a");
const CONFIG = { type: "internal", parameters: {} };

describe("a marker and a remote's filter [Postgres]", () => {
  let harness: Harness;

  afterEach(async () => {
    await harness.cleanup();
  });

  const filters: Array<[string, RemoteFilter]> = [
    ["a scope filter", { documentId: [], scope: ["global"], branch: "main" }],
    ["a document filter", { documentId: [OTHER], scope: [], branch: "main" }],
  ];

  it.each(filters)("passes %s in the outbox derivation", async (_l, filter) => {
    harness = await createHarness();
    await harness.manager.startup();
    const { manager, index, db, eventBus } = harness;
    const other = await indexOperation(index, OTHER, { joins: [COL_A.key] });
    await indexOperation(index, DOC, { joins: [COL_A.key] });
    await manager.add("a", COL_A, CONFIG, filter, {}, "a", FULL_MANIFEST);
    await vi.waitFor(() =>
      expect(
        sentOperations(harness, "a").map((op) => op.operation.id),
      ).toContain(other.operation.id),
    );

    const { entry } = await purgeInIndex(db, index, DOC);
    await emitWriteReady(eventBus, [entry], { [DOC]: [COL_A.key] });

    await vi.waitFor(() =>
      expect(sentOperations(harness, "a").at(-1)?.operation.id).toBe(
        entry.operation.id,
      ),
    );
  });

  it.each(filters)("passes %s in a released hold", async (_l, filter) => {
    harness = await createHarness();
    await harness.manager.startup();
    const { manager, index, db, eventBus } = harness;
    await indexOperation(index, DOC, { joins: [COL_A.key] });
    const { entry } = await purgeInIndex(db, index, DOC);
    await manager.add(
      "a",
      COL_A,
      CONFIG,
      filter,
      {},
      "a",
      MANIFEST_WITHOUT_PURGE,
    );
    await emitWriteReady(eventBus, [entry], { [DOC]: [COL_A.key] });
    await vi.waitFor(async () =>
      expect(await manager.listHolds({ remoteName: "a" })).toHaveLength(1),
    );
    expect(sentOperations(harness, "a")).toEqual([]);

    await manager.setPeerManifest("a", FULL_MANIFEST);

    await vi.waitFor(() =>
      expect(sentOperations(harness, "a").map((op) => op.operation.id)).toEqual(
        [entry.operation.id],
      ),
    );
  });
});
