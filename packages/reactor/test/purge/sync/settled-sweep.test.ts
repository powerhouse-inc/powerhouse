import { afterEach, describe, expect, it, vi } from "vitest";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import {
  createHarness,
  FILTER,
  indexOperation,
  type Harness,
} from "./harness.js";

const OTHER = "other-doc";
const COL_A = DriveCollectionId.forDrive("drive-a");
const CONFIG = { type: "internal", parameters: {} };
type Internals = {
  quarantinedDocumentIds: Set<string>;
  purgedDocumentIds: Set<string>;
  markerRetries: Map<string, unknown>;
  sweptThrough: number;
  derivedThrough: Map<string, number>;
  deriveSettled(): Promise<void>;
  hold(
    remote: unknown,
    documentId: string,
    branch: string,
    reason: { protocol: string; version: number; peerSupports: number[] },
  ): Promise<void>;
};

const internals = (harness: Harness) => harness.manager as unknown as Internals;

describe("the settled-range sweep [Postgres]", () => {
  let harness: Harness;

  afterEach(async () => {
    await harness.cleanup();
  });

  it("reads nothing without trailing remotes and only their collections with them", async () => {
    harness = await createHarness();
    await harness.manager.startup();
    const spy = vi.spyOn(harness.index, "getCollectionsInRange");
    const manager = internals(harness);
    manager.sweptThrough = 0;
    await manager.deriveSettled();
    expect(spy).not.toHaveBeenCalled();

    await harness.manager.add("a", COL_A, CONFIG, FILTER, {}, "a");
    await vi.waitFor(() => expect(manager.derivedThrough.has("a")).toBe(true));
    await indexOperation(harness.index, OTHER, {
      joins: [DriveCollectionId.forDrive("drive-b").key],
    });
    manager.derivedThrough.set("a", Number.MAX_SAFE_INTEGER);
    manager.sweptThrough = 0;
    await manager.deriveSettled();
    expect(spy).not.toHaveBeenCalled();

    manager.derivedThrough.delete("a");
    manager.sweptThrough = 0;
    await manager.deriveSettled();
    expect(spy).toHaveBeenCalledWith(
      0,
      expect.any(Number),
      [COL_A.key],
      expect.anything(),
    );
    expect(
      await harness.index.getCollectionsInRange(0, 1_000_000, [COL_A.key]),
    ).toEqual([]);
    expect(await harness.index.getCollectionsInRange(0, 1_000_000)).toEqual([
      DriveCollectionId.forDrive("drive-b").key,
    ]);
  });
});
