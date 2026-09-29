import {
  deriveOperationId,
  generateId,
  purgeDocumentAction,
  type Operation,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { setModelName } from "document-model";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addRelationshipAction } from "../../../src/actions/index.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { ReactorEventTypes } from "../../../src/events/types.js";
import { PURGE_NS } from "../../../src/storage/kysely/document-purges.js";
import { verifyActionSignature } from "../../../src/signer/verify-action-signature.js";
import { createDocModelDocument } from "../../factories.js";
import { TestP256Signer } from "../../utils/p256-signer.js";
import {
  createTestDatabase,
  deleteListCounts,
  expectPurged,
  expectUntouched,
  failedWith,
  legacyDrive,
  rowCount,
  startReactor,
  succeeded,
  type PurgeReactor,
  type TestDatabase,
} from "./harness.js";

const HOST_USER = { address: "0xhost", networkId: "eip155", chainId: 1 };

describe("purge job [Postgres]", () => {
  let database: TestDatabase;
  let host: PurgeReactor;
  let hostKey: TestP256Signer;

  beforeAll(async () => {
    database = await createTestDatabase("reactor_purge_executor_job");
    hostKey = await TestP256Signer.create();
    host = await startReactor(database, {
      signer: hostKey.asISigner([], HOST_USER),
      executorConfig: { maxPurgeOperations: 8 },
    });
  });

  afterAll(async () => {
    try {
      await host?.kill();
    } finally {
      await database?.drop();
    }
  });

  async function createDocument(document?: PHDocument): Promise<string> {
    const created = document ?? createDocModelDocument({ id: generateId() });
    await succeeded(host.reactor, (await host.reactor.create(created)).id);
    return created.header.id;
  }

  async function rename(documentId: string, name: string): Promise<void> {
    await succeeded(
      host.reactor,
      (
        await host.reactor.execute(documentId, "main", [
          setModelName({ name }),
        ])
      ).id,
    );
  }

  async function remove(documentId: string): Promise<void> {
    await succeeded(
      host.reactor,
      (await host.reactor.deleteDocument(documentId)).id,
    );
  }

  async function purgeOne(
    documentId: string,
    options: { allowLarge?: boolean; requestIds?: string[] } = {},
  ): Promise<string> {
    const ids = options.requestIds ?? [documentId];
    const infos = await host.service.enqueuePurge(ids, "request-1", {
      allowLarge: options.allowLarge,
    });
    return infos.find((info) => info.documentId === documentId)!.id;
  }

  it("refuses a live document with nothing changed", async () => {
    const documentId = await createDocument();
    await rename(documentId, "live");
    const before = await deleteListCounts(host.db, documentId);

    const jobId = await purgeOne(documentId);
    await failedWith(host.reactor, jobId, "DocumentNotDeletedError");
    await expectUntouched(host.db, documentId, before);
  });

  it("refuses an id this reactor never held", async () => {
    const jobId = await purgeOne(generateId());
    await failedWith(host.reactor, jobId, "DocumentNotDeletedError");
  });

  it("erases a deleted document down to one signed marker", async () => {
    const documentId = await createDocument();
    await rename(documentId, "doomed");
    await remove(documentId);
    const drive = legacyDrive();
    await createDocument(drive);
    await succeeded(
      host.reactor,
      (
        await host.reactor.execute(drive.header.id, "main", [
          addRelationshipAction(drive.header.id, documentId, "child"),
        ])
      ).id,
    );
    await succeeded(
      host.reactor,
      (
        await host.reactor.removeRelationship(
          drive.header.id,
          documentId,
          "child",
        )
      ).id,
    );
    const before = await deleteListCounts(host.db, documentId);
    expect(before.Operation).toBeGreaterThan(0);

    const info = await succeeded(
      host.reactor,
      await purgeOne(documentId),
    );
    expect(info.error).toBeUndefined();

    const marker = await expectPurged(host.db, documentId);
    expect(marker.action.input).toMatchObject({
      documentId,
      documentType: "powerhouse/document-model",
      requestId: "request-1",
      purgedAtUtcIso: marker.action.timestampUtcMs,
    });
    expect(marker.action.context?.signer?.app.key).toBe(hostKey.did);
    expect(marker.action.context?.signer?.user).toEqual(HOST_USER);
    expect(
      await verifyActionSignature(
        marker.action,
        { documentId, branch: "main", policy: "v2-required" },
        "load",
        marker,
      ),
    ).toEqual({ ok: true, scheme: "v2" });

    const twin = await host.db
      .selectFrom("operation_index_operations")
      .selectAll()
      .where("documentId", "=", documentId)
      .executeTakeFirstOrThrow();
    expect(twin.opId).toBe(marker.id);
    expect(twin.documentType).toBe("powerhouse/document-model");

    const tombstone = await host.db
      .selectFrom("document_purges")
      .selectAll()
      .where("documentId", "=", documentId)
      .executeTakeFirstOrThrow();
    expect(Number(tombstone.ordinal)).toBe(Number(twin.ordinal));
    expect(tombstone.requestId).toBe("request-1");
    expect(tombstone.removedRows).toMatchObject({
      Operation: before.Operation,
      operation_index_operations: before.operation_index_operations,
      Keyframe: before.Keyframe,
      DocumentSnapshot: before.DocumentSnapshot,
      SlugMapping: before.SlugMapping,
      Document: before.Document,
    });

    const memberships = await host.db
      .selectFrom("document_collections")
      .selectAll()
      .where("documentId", "=", documentId)
      .execute();
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({
      collectionId: DriveCollectionId.forDrive(drive.header.id).key,
      leftOrdinal: null,
    });
    expect(Number(memberships[0].joinedOrdinal)).toBe(Number(twin.ordinal));
  });

  it("purges a second time as an idempotent no-op", async () => {
    const documentId = await createDocument();
    await remove(documentId);
    await succeeded(host.reactor, await purgeOne(documentId));
    const first = await expectPurged(host.db, documentId);

    await succeeded(host.reactor, await purgeOne(documentId));
    const second = await expectPurged(host.db, documentId);
    expect(second).toEqual(first);
  });

  it("refuses a document above the cap unless allowLarge", async () => {
    const documentId = await createDocument();
    for (let i = 0; i < 8; i++) {
      await rename(documentId, `name-${i}`);
    }
    await remove(documentId);
    const before = await deleteListCounts(host.db, documentId);
    expect(before.operation_index_operations).toBeGreaterThan(8);

    await failedWith(
      host.reactor,
      await purgeOne(documentId),
      "PurgeTooLargeError",
    );
    await expectUntouched(host.db, documentId, before);

    await succeeded(
      host.reactor,
      await purgeOne(documentId, { allowLarge: true }),
    );
    await expectPurged(host.db, documentId);
  });

  it("refuses a drive while a member is neither purged nor requested", async () => {
    const drive = legacyDrive();
    const driveId = await createDocument(drive);
    const childId = await createDocument();
    await succeeded(
      host.reactor,
      (
        await host.reactor.execute(driveId, "main", [
          addRelationshipAction(driveId, childId, "child"),
        ])
      ).id,
    );
    await remove(driveId);
    const before = await deleteListCounts(host.db, driveId);

    await failedWith(
      host.reactor,
      await purgeOne(driveId),
      "DocumentNotDeletedError",
    );
    await expectUntouched(host.db, driveId, before);

    await remove(childId);
    const driveJob = await purgeOne(driveId, {
      requestIds: [driveId, childId],
    });
    await succeeded(host.reactor, driveJob);
    await expectPurged(host.db, driveId);
  });

  it("purges a drive once its members are purged", async () => {
    const drive = legacyDrive();
    const driveId = await createDocument(drive);
    const childId = await createDocument();
    await succeeded(
      host.reactor,
      (
        await host.reactor.execute(driveId, "main", [
          addRelationshipAction(driveId, childId, "child"),
        ])
      ).id,
    );
    await remove(childId);
    await remove(driveId);
    await succeeded(host.reactor, await purgeOne(childId));
    await succeeded(host.reactor, await purgeOne(driveId));
    await expectPurged(host.db, driveId);
    await expectPurged(host.db, childId);
  });

  it("refuses PURGE_DOCUMENT as a regular write before taking any lock", async () => {
    const documentId = await createDocument();
    const before = await deleteListCounts(host.db, documentId);
    const blocker = new Pool({ connectionString: database.url, max: 1 });
    const client = await blocker.connect();
    try {
      await client.query("begin");
      await client.query(
        `select pg_advisory_xact_lock(${PURGE_NS}, hashtext($1))`,
        [documentId],
      );
      const action = purgeDocumentAction({
        documentId,
        documentType: "powerhouse/document-model",
        requestId: "forged",
      });
      const info = await host.reactor.execute(documentId, "main", [action]);
      await failedWith(host.reactor, info.id, "ReservedActionError");
    } finally {
      await client.query("rollback");
      client.release();
      await blocker.end();
    }
    await expectUntouched(host.db, documentId, before);
  });

  it("refuses a replayed, validly signed operation of the purged document", async () => {
    const author = await TestP256Signer.create();
    const documentId = await createDocument();
    const action = setModelName({ name: "signed" });
    const signed = author.signed(
      action,
      await author.v2Tuple(action, { documentId, branch: "main" }),
    );
    await succeeded(
      host.reactor,
      (await host.reactor.execute(documentId, "main", [signed])).id,
    );
    const stored = (
      await host.db
        .selectFrom("Operation")
        .selectAll()
        .where("documentId", "=", documentId)
        .where("scope", "=", "global")
        .execute()
    ).map(
      (row): Operation => ({
        id: row.opId,
        index: row.index,
        skip: row.skip,
        hash: row.hash,
        timestampUtcMs: row.timestampUtcMs.toISOString(),
        action: row.action as Operation["action"],
      }),
    );
    await remove(documentId);
    await succeeded(host.reactor, await purgeOne(documentId));
    await expectPurged(host.db, documentId);

    const refusals: unknown[] = [];
    const unsubscribe = host.module.eventBus.subscribe(
      ReactorEventTypes.SIGNATURE_REFUSED,
      (_type: number, event: unknown) => {
        refusals.push(event);
      },
    );
    try {
      await failedWith(
        host.reactor,
        (await host.reactor.execute(documentId, "main", [signed])).id,
        "DocumentPurgedError",
      );
      await failedWith(
        host.reactor,
        (await host.reactor.load(documentId, "main", stored)).id,
        "DocumentPurgedError",
      );
    } finally {
      unsubscribe();
    }
    expect(refusals).toEqual([]);
    await expectPurged(host.db, documentId);
  });

  it("fails a re-evaluation of a purged document terminally, writing nothing", async () => {
    const documentId = await createDocument();
    await remove(documentId);
    await succeeded(host.reactor, await purgeOne(documentId));
    const marker = await expectPurged(host.db, documentId);

    const jobId = generateId();
    host.module.jobTracker.registerJob({
      id: jobId,
      documentId,
      status: "PENDING" as never,
      createdAtUtcIso: new Date().toISOString(),
      consistencyToken: {
        version: 1,
        createdAtUtcIso: new Date().toISOString(),
        coordinates: [],
      },
      meta: { batchId: jobId, batchJobIds: [jobId] },
    });
    await host.module.queue.enqueue({
      id: jobId,
      kind: "reevaluation",
      documentId,
      scope: "global",
      branch: "main",
      actions: [],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      maxRetries: 3,
      errorHistory: [],
      meta: { batchId: jobId, batchJobIds: [jobId] },
    });
    await failedWith(host.reactor, jobId, "DocumentPurgedError");
    expect(await expectPurged(host.db, documentId)).toEqual(marker);
  });

  it("refuses a submitted relationship to a purged target", async () => {
    const childId = await createDocument();
    await remove(childId);
    await succeeded(host.reactor, await purgeOne(childId));
    const driveId = await createDocument(legacyDrive());

    await failedWith(
      host.reactor,
      (
        await host.reactor.execute(driveId, "main", [
          addRelationshipAction(driveId, childId, "child"),
        ])
      ).id,
      "DocumentPurgedError",
    );
    await expectPurged(host.db, childId);
  });

  it("loads a relationship to a purged target without its membership", async () => {
    const childId = await createDocument();
    await remove(childId);
    await succeeded(host.reactor, await purgeOne(childId));
    const driveId = await createDocument(legacyDrive());
    const revisions = await host.module.operationStore.getRevisions(
      driveId,
      "main",
    );
    const action = addRelationshipAction(driveId, childId, "child");
    const operation: Operation = {
      id: deriveOperationId(driveId, "document", "main", action.id),
      index: revisions.revision.document,
      skip: 0,
      hash: "",
      timestampUtcMs: action.timestampUtcMs,
      action,
    };

    await succeeded(
      host.reactor,
      (await host.reactor.load(driveId, "main", [operation])).id,
    );
    expect(
      await host.db
        .selectFrom("Operation")
        .select("opId")
        .where("opId", "=", operation.id)
        .execute(),
    ).toHaveLength(1);
    const memberships = await host.db
      .selectFrom("document_collections")
      .select("collectionId")
      .where("documentId", "=", childId)
      .execute();
    expect(memberships).toEqual([]);
    await expectPurged(host.db, childId);
  });

  it("refuses to re-create a purged id", async () => {
    const document = createDocModelDocument({ id: generateId() });
    const documentId = await createDocument(document);
    await remove(documentId);
    await succeeded(host.reactor, await purgeOne(documentId));
    await failedWith(
      host.reactor,
      (await host.reactor.create(document)).id,
      "DocumentPurgedError",
    );
    await expectPurged(host.db, documentId);
    expect(
      await rowCount(host.db, "document_purges", "documentId", documentId),
    ).toBe(1);
  });
});
