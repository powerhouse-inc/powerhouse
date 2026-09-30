import {
  deriveOperationId,
  generateId,
  type Action,
  type Operation,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addRelationshipAction,
  deleteDocumentAction,
  removeRelationshipAction,
} from "../../../src/actions/index.js";
import { JobStatus } from "../../../src/shared/types.js";
import { createDocModelDocument } from "../../factories.js";
import { TestP256Signer } from "../../utils/p256-signer.js";
import {
  createTestDatabase,
  expectPurged,
  legacyDrive,
  rowCount,
  settled,
  startReactor,
  succeeded,
  type PurgeReactor,
  type TestDatabase,
} from "../executor/harness.js";

const HOST_USER = { address: "0xhost", networkId: "eip155", chainId: 1 };

describe("r1: a load for a live document naming a purged id [Postgres]", () => {
  let database: TestDatabase;
  let host: PurgeReactor;

  beforeAll(async () => {
    database = await createTestDatabase("reactor_review_r1_foreign");
    const key = await TestP256Signer.create();
    host = await startReactor(database, {
      signer: key.asISigner([], HOST_USER),
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

  async function purgedDocument(): Promise<string> {
    const id = await createDocument();
    await succeeded(host.reactor, (await host.reactor.deleteDocument(id)).id);
    const [purge] = await host.service.enqueuePurge([id], "req");
    await succeeded(host.reactor, purge.id);
    await expectPurged(host.db, id);
    return id;
  }

  async function loadInto(driveId: string, action: Action) {
    const revisions = await host.module.operationStore.getRevisions(
      driveId,
      "main",
    );
    const operation: Operation = {
      id: deriveOperationId(driveId, "document", "main", action.id),
      index: revisions.revision.document,
      skip: 0,
      hash: "",
      timestampUtcMs: action.timestampUtcMs,
      action,
    };
    const info = await settled(
      host.reactor,
      (await host.reactor.load(driveId, "main", [operation])).id,
    );
    return { info, operation };
  }

  it("refuses a foreign purged relationship source as an id mismatch", async () => {
    const purgedId = await purgedDocument();
    const driveId = await createDocument(legacyDrive());

    const { info } = await loadInto(
      driveId,
      addRelationshipAction(purgedId, driveId, "child"),
    );
    expect(info.status).toBe(JobStatus.FAILED);
    expect(info.error?.name).toBe("InvalidSignatureError");
    expect(info.error?.message).toContain("[ID_MISMATCH]");
    expect(info.job?.retryCount ?? 0).toBe(0);
  });

  it("refuses a foreign purged input.documentId as an id mismatch", async () => {
    const purgedId = await purgedDocument();
    const driveId = await createDocument(legacyDrive());

    const { info } = await loadInto(driveId, deleteDocumentAction(purgedId));
    expect(info.status).toBe(JobStatus.FAILED);
    expect(info.error?.name).toBe("InvalidSignatureError");
    expect(info.error?.message).toContain("[ID_MISMATCH]");
  });

  it.each([
    ["ADD_RELATIONSHIP", addRelationshipAction],
    ["REMOVE_RELATIONSHIP", removeRelationshipAction],
  ] as const)(
    "accepts a loaded %s whose target is purged",
    async (_type, build) => {
      const purgedId = await purgedDocument();
      const driveId = await createDocument(legacyDrive());

      const { info, operation } = await loadInto(
        driveId,
        build(driveId, purgedId, "child"),
      );
      expect(info.status).toBe(JobStatus.READ_READY);
      expect(await rowCount(host.db, "Operation", "opId", operation.id)).toBe(
        1,
      );
      await expectPurged(host.db, purgedId);
    },
  );
});
