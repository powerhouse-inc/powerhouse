import { DOCUMENT_PURGE_PROTOCOL } from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it } from "vitest";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { DocumentPurgedError } from "../../../src/shared/errors.js";
import { KyselySyncHoldStorage } from "../../../src/storage/kysely/sync-hold-storage.js";
import { seedTombstone } from "../helpers.js";
import {
  createHarness,
  FILTER,
  FULL_MANIFEST,
  type Harness,
} from "./harness.js";

const DOC = "purged-doc";
const COL_A = DriveCollectionId.forDrive("drive-a");
const CONFIG = { type: "internal", parameters: {} };
type Internals = {
  quarantinedDocumentIds: Set<string>;
  purgedDocumentIds: Set<string>;
  markerRetries: Map<string, unknown>;
  sweptThrough: number;
  deriveSettled(): Promise<void>;
  hold(
    remote: unknown,
    documentId: string,
    branch: string,
    reason: { protocol: string; version: number; peerSupports: number[] },
  ): Promise<void>;
};

const internals = (harness: Harness) => harness.manager as unknown as Internals;

describe("hold writes for a purged id [Postgres]", () => {
  let harness: Harness;

  afterEach(async () => {
    await harness.cleanup();
  });

  const record = (protocol: string) => ({
    remoteName: "a",
    documentId: DOC,
    branch: "main",
    protocol,
    version: 2,
    heldAtUtcMs: Date.now(),
  });

  it("are refused by storage unless the hold is the marker's", async () => {
    harness = await createHarness();
    await harness.manager.startup();
    await harness.manager.add("a", COL_A, CONFIG, FILTER, {}, "a");
    const holds = new KyselySyncHoldStorage(harness.storage.db);
    await seedTombstone(harness.db, DOC, 1);

    await expect(holds.upsert(record("some-protocol"))).rejects.toSatisfy(
      (error) => DocumentPurgedError.isError(error),
    );
    await holds.upsert(record(DOCUMENT_PURGE_PROTOCOL));
    expect(await holds.list()).toEqual([
      expect.objectContaining({ protocol: DOCUMENT_PURGE_PROTOCOL }),
    ]);
  });

  it("teach the sync manager the id is purged and leave no hold", async () => {
    harness = await createHarness();
    await harness.manager.startup();
    const { manager } = harness;
    await manager.add("a", COL_A, CONFIG, FILTER, {}, "a", FULL_MANIFEST);
    await seedTombstone(harness.db, DOC, 1);

    await internals(harness).hold(manager.getByName("a"), DOC, "main", {
      protocol: "some-protocol",
      version: 2,
      peerSupports: [1],
    });

    expect(await manager.listHolds()).toEqual([]);
    expect(internals(harness).purgedDocumentIds.has(DOC)).toBe(true);
  });
});
