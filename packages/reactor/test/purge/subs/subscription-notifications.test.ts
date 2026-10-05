import {
  generateId,
  type ISigner,
  type Operation,
} from "@powerhousedao/shared/document-model";
import { setModelName } from "document-model";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import {
  ReactorEventTypes,
  type JobWriteReadyEvent,
  type PurgeMarkerContext,
  type ReadModelIndexedEvent,
} from "../../../src/events/types.js";
import { createDocModelDocument } from "../../factories.js";
import { TestP256Signer } from "../../utils/p256-signer.js";
import { TRUST_ANY_SIGNER } from "../../utils/signed-as.js";
import { signedPurgeMarker } from "../helpers.js";
import {
  createTestDatabase,
  expectPurged,
  startReactor,
  succeeded,
  type PurgeReactor,
  type TestDatabase,
} from "../executor/harness.js";

const REMOTE = "remote-a";
const REMOTE_COLLECTION = DriveCollectionId.forDrive("remote-drive").key;

describe("subscription notifications for a purge marker [Postgres]", () => {
  let database: TestDatabase;
  let receiver: PurgeReactor;
  let origin: ISigner;
  const deletedNotices: string[][] = [];
  const purgedNotices: string[][] = [];
  const writeReady: JobWriteReadyEvent[] = [];
  const notified: ReadModelIndexedEvent[] = [];
  const indexed: ReadModelIndexedEvent[] = [];

  beforeAll(async () => {
    database = await createTestDatabase("reactor_purge_subscription_notices");
    receiver = await startReactor(database, {
      signer: (await TestP256Signer.create()).asISigner(),
      trustPolicy: TRUST_ANY_SIGNER,
    });
    origin = (await TestP256Signer.create()).asISigner([], {
      address: "0xorigin",
      networkId: "eip155",
      chainId: 1,
    });
    await (receiver.db as Kysely<any>)
      .insertInto("sync_remotes")
      .values({
        name: REMOTE,
        collection_id: REMOTE_COLLECTION,
        channel_type: "test",
      })
      .execute();
    const manager = receiver.module.subscriptionManager;
    manager.onDocumentDeleted((ids, info) => {
      deletedNotices.push(ids);
      if (info?.purged) purgedNotices.push(ids);
    });
    receiver.module.eventBus.subscribe(
      ReactorEventTypes.JOB_WRITE_READY,
      (_type: number, event: JobWriteReadyEvent) => {
        writeReady.push(event);
      },
    );
    receiver.module.eventBus.subscribe(
      ReactorEventTypes.READMODEL_INDEXED,
      (_type: number, event: ReadModelIndexedEvent) => {
        indexed.push(event);
        if (event.readModelName === "subscription-notification") {
          notified.push(event);
        }
      },
    );
  });

  afterAll(async () => {
    try {
      await receiver?.kill();
    } finally {
      await database?.drop();
    }
  });

  async function createDocument(): Promise<string> {
    const document = createDocModelDocument({ id: generateId() });
    await succeeded(
      receiver.reactor,
      (await receiver.reactor.create(document)).id,
    );
    await succeeded(
      receiver.reactor,
      (
        await receiver.reactor.execute(document.header.id, "main", [
          setModelName({ name: "held" }),
        ])
      ).id,
    );
    return document.header.id;
  }

  async function loadMarker(documentId: string): Promise<string> {
    const marker: Operation = await signedPurgeMarker(origin, documentId);
    const info = await succeeded(
      receiver.reactor,
      (
        await receiver.reactor.load(documentId, "main", [marker], undefined, {
          sourceRemote: REMOTE,
        })
      ).id,
    );
    await expectPurged(receiver.db, documentId);
    await notifiedFor(info.id);
    return info.id;
  }

  async function notifiedFor(jobId: string): Promise<void> {
    await vi.waitFor(() =>
      expect(notified.find((event) => event.jobId === jobId)).toMatchObject({
        success: true,
      }),
    );
    await vi.waitFor(() =>
      expect(
        indexed
          .filter((event) => event.jobId === jobId)
          .map((event) => event.readModelName),
      ).toEqual(
        expect.arrayContaining([
          "subscription-notification",
          "processor-manager",
        ]),
      ),
    );
    const failed = indexed.filter((event) => !event.success);
    expect(failed.map((event) => event.readModelName)).toEqual([]);
  }

  function markerContext(jobId: string): PurgeMarkerContext {
    const event = writeReady.find((entry) => entry.jobId === jobId);
    expect(event?.operations).toHaveLength(1);
    return event!.operations[0].context;
  }

  function deletedCount(documentId: string): number {
    return deletedNotices.filter((ids) => ids.includes(documentId)).length;
  }

  it("emits Deleted when a load's marker deletes a live document", async () => {
    const documentId = await createDocument();
    expect(deletedCount(documentId)).toBe(0);

    const jobId = await loadMarker(documentId);

    expect(markerContext(jobId).appliedDeletion).toBe(true);
    expect(deletedCount(documentId)).toBe(1);
    expect(purgedNotices).toContainEqual([documentId]);
  });

  it("emits nothing for a marker on an already-deleted document", async () => {
    const documentId = await createDocument();
    await succeeded(
      receiver.reactor,
      (await receiver.reactor.deleteDocument(documentId)).id,
    );
    await vi.waitFor(() => expect(deletedCount(documentId)).toBe(1));
    expect(purgedNotices.flat()).not.toContain(documentId);

    const jobId = await loadMarker(documentId);
    expect(markerContext(jobId).appliedDeletion).toBeUndefined();
    expect(deletedCount(documentId)).toBe(1);
  });

  it("emits nothing for a marker on a document it never held", async () => {
    const documentId = generateId();
    const jobId = await loadMarker(documentId);
    expect(markerContext(jobId).appliedDeletion).toBeUndefined();
    expect(deletedCount(documentId)).toBe(0);
  });

  it("emits nothing for a local purge of a deleted document", async () => {
    const documentId = await createDocument();
    await succeeded(
      receiver.reactor,
      (await receiver.reactor.deleteDocument(documentId)).id,
    );
    await vi.waitFor(() => expect(deletedCount(documentId)).toBe(1));

    const [info] = await receiver.service.enqueuePurge([documentId], "req-1");
    await succeeded(receiver.reactor, info.id);
    await expectPurged(receiver.db, documentId);
    await notifiedFor(info.id);
    expect(markerContext(info.id).appliedDeletion).toBeUndefined();
    expect(deletedCount(documentId)).toBe(1);
  });
});
