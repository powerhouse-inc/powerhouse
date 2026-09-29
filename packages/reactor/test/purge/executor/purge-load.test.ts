import {
  actionSignerIdentity,
  generateId,
  type ISigner,
  type Operation,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { setModelName } from "document-model";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteDocumentAction } from "../../../src/actions/index.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import {
  ReactorEventTypes,
  type JobWriteReadyEvent,
} from "../../../src/events/types.js";
import { createDocModelDocument } from "../../factories.js";
import { TestP256Signer } from "../../utils/p256-signer.js";
import { TRUST_ANY_SIGNER } from "../../utils/signed-as.js";
import { purgeMarker, signedPurgeMarker } from "../helpers.js";
import {
  createTestDatabase,
  deleteListCounts,
  expectPurged,
  expectUntouched,
  failedWith,
  startReactor,
  succeeded,
  type PurgeReactor,
  type TestDatabase,
} from "./harness.js";

const REMOTE = "remote-a";
const REMOTE_COLLECTION = DriveCollectionId.forDrive("remote-drive").key;

describe.each([
  { flags: "no flags", featureFlags: {}, database: "reactor_purge_load_plain" },
  {
    flags: "decisions and auth",
    featureFlags: { documentDecisions: true, authEnforcement: true },
    database: "reactor_purge_load_decisions",
  },
])("receiving a purge marker, $flags [Postgres]", (suite) => {
  let database: TestDatabase;
  let receiver: PurgeReactor;
  let origin: ISigner;
  const writeReady: JobWriteReadyEvent[] = [];

  beforeAll(async () => {
    database = await createTestDatabase(suite.database);
    receiver = await startReactor(database, {
      signer: (await TestP256Signer.create()).asISigner(),
      featureFlags: suite.featureFlags,
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
    receiver.module.eventBus.subscribe(
      ReactorEventTypes.JOB_WRITE_READY,
      (_type: number, event: JobWriteReadyEvent) => {
        writeReady.push(event);
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

  async function load(documentId: string, operations: Operation[]) {
    return receiver.reactor.load(documentId, "main", operations, undefined, {
      sourceRemote: REMOTE,
    });
  }

  async function twinOf(documentId: string) {
    return receiver.db
      .selectFrom("operation_index_operations")
      .selectAll()
      .where("documentId", "=", documentId)
      .executeTakeFirstOrThrow();
  }

  async function membershipsOf(documentId: string) {
    return receiver.db
      .selectFrom("document_collections")
      .selectAll()
      .where("documentId", "=", documentId)
      .orderBy("collectionId")
      .execute();
  }

  function eventsFor(jobId: string): OperationWithContext[][] {
    return writeReady
      .filter((event) => event.jobId === jobId)
      .map((event) => event.operations);
  }

  it("purges a held, deleted document", async () => {
    const documentId = await createDocument();
    await succeeded(
      receiver.reactor,
      (await receiver.reactor.deleteDocument(documentId)).id,
    );
    const marker = await signedPurgeMarker(origin, documentId);

    const info = await succeeded(
      receiver.reactor,
      (await load(documentId, [marker])).id,
    );
    const stored = await expectPurged(receiver.db, documentId);
    expect(stored.id).toBe(marker.id);
    expect(stored.action).toEqual(marker.action);

    const twin = await twinOf(documentId);
    expect(twin.sourceRemote).toBe(REMOTE);
    const memberships = await membershipsOf(documentId);
    expect(memberships).toMatchObject([
      { collectionId: REMOTE_COLLECTION, leftOrdinal: null },
    ]);
    expect(Number(memberships[0].joinedOrdinal)).toBe(Number(twin.ordinal));
    expect(
      eventsFor(info.id).map((ops) => ops.map((op) => op.operation.id)),
    ).toEqual([[marker.id]]);
  });

  it("applies the deletion then purges a held, live document, dropping the rest of the job", async () => {
    const documentId = await createDocument();
    const marker = await signedPurgeMarker(origin, documentId);
    const deletion = deleteDocumentAction(documentId);
    const extra: Operation = {
      ...purgeMarker(documentId),
      id: "extra",
      index: 3,
      action: deletion,
      timestampUtcMs: deletion.timestampUtcMs,
    };

    await succeeded(receiver.reactor, (await load(documentId, [extra, marker])).id);
    const stored = await expectPurged(receiver.db, documentId);
    expect(stored.id).toBe(marker.id);
  });

  it("records a marker for a document it never held", async () => {
    const documentId = generateId();
    const marker = await signedPurgeMarker(origin, documentId, {
      documentType: "powerhouse/document-drive",
    });

    await succeeded(receiver.reactor, (await load(documentId, [marker])).id);
    await expectPurged(receiver.db, documentId);
    const twin = await twinOf(documentId);
    expect(twin.documentType).toBe("powerhouse/document-drive");
    expect(twin.sourceRemote).toBe(REMOTE);
    const tombstone = await receiver.db
      .selectFrom("document_purges")
      .selectAll()
      .where("documentId", "=", documentId)
      .executeTakeFirstOrThrow();
    expect(Number(tombstone.ordinal)).toBe(Number(twin.ordinal));
    const memberships = await membershipsOf(documentId);
    expect(memberships).toMatchObject([
      { collectionId: REMOTE_COLLECTION, leftOrdinal: null },
    ]);
  });

  it("succeeds without a write on a marker for a purged document", async () => {
    const documentId = generateId();
    const marker = await signedPurgeMarker(origin, documentId);
    await succeeded(receiver.reactor, (await load(documentId, [marker])).id);
    const first = await expectPurged(receiver.db, documentId);
    const twin = await twinOf(documentId);

    for (const again of [
      marker,
      await signedPurgeMarker(origin, documentId),
    ]) {
      const info = await succeeded(
        receiver.reactor,
        (await load(documentId, [again])).id,
      );
      expect(eventsFor(info.id)).toEqual([[]]);
    }
    expect(await expectPurged(receiver.db, documentId)).toEqual(first);
    expect(await twinOf(documentId)).toEqual(twin);
  });

  it("bypasses reshuffle for a marker older than local operations", async () => {
    const markerTime = new Date(Date.now() - 60_000).toISOString();
    const documentId = await createDocument();
    await succeeded(
      receiver.reactor,
      (await receiver.reactor.deleteDocument(documentId)).id,
    );
    const marker = await signedPurgeMarker(origin, documentId, {
      timestampUtcMs: markerTime,
    });

    const info = await succeeded(
      receiver.reactor,
      (await load(documentId, [marker])).id,
    );
    const stored = await expectPurged(receiver.db, documentId);
    expect(stored.timestampUtcMs).toBe(markerTime);
    expect(
      eventsFor(info.id).map((ops) => ops.map((op) => op.operation.id)),
    ).toEqual([[marker.id]]);
  });

  it("refuses an unsigned marker terminally, changing nothing", async () => {
    const documentId = await createDocument();
    const before = await deleteListCounts(receiver.db, documentId);

    await failedWith(
      receiver.reactor,
      (await load(documentId, [purgeMarker(documentId)])).id,
      "InvalidSignatureError",
    );
    await expectUntouched(receiver.db, documentId, before);
  });

  it("refuses a validly signed marker whose input carries more than it may", async () => {
    const documentId = generateId();
    const unsigned = purgeMarker(documentId);
    const action = {
      ...unsigned.action,
      input: {
        ...unsigned.action.input,
        protocolVersions: { "base-reducer": 2 },
      },
    };
    const signature = await origin.signAction(action, {
      documentId,
      branch: "main",
    });
    const forged: Operation = {
      ...unsigned,
      action: {
        ...action,
        context: {
          signer: { ...actionSignerIdentity(origin), signatures: [signature] },
        },
      },
    };
    const before = await deleteListCounts(receiver.db, documentId);

    await failedWith(
      receiver.reactor,
      (await load(documentId, [forged])).id,
      "InvalidSignatureError",
    );
    await expectUntouched(receiver.db, documentId, before);
  });

  it("refuses a marker signed for another document", async () => {
    const documentId = await createDocument();
    const before = await deleteListCounts(receiver.db, documentId);
    const foreign = await signedPurgeMarker(origin, generateId());

    await failedWith(
      receiver.reactor,
      (await load(documentId, [foreign])).id,
      "InvalidSignatureError",
    );
    await expectUntouched(receiver.db, documentId, before);
  });
});
