import {
  generateId,
  type ISigner,
  type Operation,
} from "@powerhousedao/shared/document-model";
import { setModelName } from "document-model";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { JobStatus } from "../../../src/shared/types.js";
import { createDocModelDocument } from "../../factories.js";
import { TestP256Signer } from "../../utils/p256-signer.js";
import { signedPurgeMarker } from "../helpers.js";
import {
  createTestDatabase,
  settled,
  startReactor,
  succeeded,
  type PurgeReactor,
  type TestDatabase,
} from "./harness.js";

const REMOTE = "remote-a";
const REMOTE_COLLECTION = DriveCollectionId.forDrive("remote-drive").key;

async function tombstoneOf(receiver: PurgeReactor, id: string) {
  return receiver.db
    .selectFrom("document_purges")
    .selectAll()
    .where("documentId", "=", id)
    .executeTakeFirst();
}

async function rowsOf(receiver: PurgeReactor, id: string) {
  return receiver.db
    .selectFrom("Operation")
    .selectAll()
    .where("documentId", "=", id)
    .execute();
}

async function indexRowsOf(receiver: PurgeReactor, id: string) {
  return receiver.db
    .selectFrom("operation_index_operations")
    .selectAll()
    .where("documentId", "=", id)
    .execute();
}

describe.each([
  {
    label: "log mode, trust any",
    database: "reactor_r2_log_any",
    refuseAll: false,
    mode: "log" as const,
  },
  {
    label: "log mode, trust none",
    database: "reactor_r2_log_none",
    refuseAll: true,
    mode: "log" as const,
  },
  {
    label: "enforce mode, trust any",
    database: "reactor_r2_enforce_any",
    refuseAll: false,
    mode: "enforce" as const,
  },
])("r2: marker admission under $label [Postgres]", (suite) => {
  let database: TestDatabase;
  let receiver: PurgeReactor;
  let origin: ISigner;

  beforeAll(async () => {
    database = await createTestDatabase(suite.database);
    receiver = await startReactor(database, {
      signer: (await TestP256Signer.create()).asISigner(),
      featureFlags: { documentDecisions: true, authEnforcement: true },
      executorConfig: { signatureVerification: suite.mode },
      trustPolicy: {
        authorizeSigner: () => Promise.resolve(!suite.refuseAll),
      },
    });
    origin = (await TestP256Signer.create()).asISigner([], {
      address: "0xattacker",
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
  });

  afterAll(async () => {
    try {
      await receiver?.kill();
    } finally {
      await database?.drop();
    }
  });

  async function liveDocument(): Promise<string> {
    const document = createDocModelDocument({ id: generateId() });
    await succeeded(
      receiver.reactor,
      (await receiver.reactor.create(document)).id,
    );
    await succeeded(
      receiver.reactor,
      (
        await receiver.reactor.execute(document.header.id, "main", [
          setModelName({ name: "personal data" }),
        ])
      ).id,
    );
    return document.header.id;
  }

  function load(documentId: string, operations: Operation[]) {
    return receiver.reactor.load(documentId, "main", operations, undefined, {
      sourceRemote: REMOTE,
    });
  }

  it("refuses a marker whose signature does not verify", async () => {
    const documentId = await liveDocument();
    const good = await signedPurgeMarker(origin, documentId);
    const other = await signedPurgeMarker(origin, documentId);
    const forged: Operation = {
      ...other,
      action: { ...other.action, context: good.action.context },
    };

    const info = await settled(
      receiver.reactor,
      (await load(documentId, [forged])).id,
    );
    expect(info.status).toBe(JobStatus.FAILED);
    expect(info.error?.name).toBe("InvalidSignatureError");
    expect(await tombstoneOf(receiver, documentId)).toBeUndefined();
    expect((await rowsOf(receiver, documentId)).length).toBeGreaterThan(1);
  });

  it("purges only for a trusted signer", async () => {
    const documentId = await liveDocument();
    const marker = await signedPurgeMarker(origin, documentId);
    const info = await settled(
      receiver.reactor,
      (await load(documentId, [marker])).id,
    );
    if (suite.refuseAll) {
      expect(info.error?.name).toBe("InvalidSignatureError");
      expect(await tombstoneOf(receiver, documentId)).toBeUndefined();
    } else {
      expect(info.status).toBe(JobStatus.READ_READY);
      expect(await tombstoneOf(receiver, documentId)).toBeDefined();
    }
  });

  it("refuses a marker whose envelope timestamp is not its action's", async () => {
    const documentId = await liveDocument();
    const marker = await signedPurgeMarker(origin, documentId);
    const shifted: Operation = {
      ...marker,
      timestampUtcMs: "2001-01-01T00:00:00.000Z",
    };
    const info = await settled(
      receiver.reactor,
      (await load(documentId, [shifted])).id,
    );
    expect(info.error?.name).toBe("InvalidSignatureError");
    expect(await tombstoneOf(receiver, documentId)).toBeUndefined();
  });

  it("stores its own marker envelope, not the peer's", async () => {
    const documentId = generateId();
    const marker = await signedPurgeMarker(origin, documentId);
    const odd: Operation = {
      ...marker,
      index: 7,
      skip: 3,
      id: "not-derived",
      hash: "peer-hash",
      error: "peer supplied text",
    };
    const info = await settled(
      receiver.reactor,
      (await load(documentId, [odd])).id,
    );
    const rows = (await rowsOf(receiver, documentId)).map((row) => ({
      index: row.index,
      skip: row.skip,
      opId: row.opId,
      hash: row.hash,
      error: row.error ?? null,
      ts: row.timestampUtcMs.toISOString(),
    }));
    const twins = (await indexRowsOf(receiver, documentId)).map((row) => ({
      index: row.index,
      skip: row.skip,
      opId: row.opId,
      hash: row.hash,
    }));
    if (suite.refuseAll) {
      expect(info.error?.name).toBe("InvalidSignatureError");
      expect(rows).toEqual([]);
      return;
    }
    expect(info.status).toBe(JobStatus.READ_READY);
    expect(rows).toEqual([
      {
        index: 0,
        skip: 0,
        opId: marker.id,
        hash: "",
        error: null,
        ts: marker.action.timestampUtcMs,
      },
    ]);
    expect(twins).toEqual([{ index: 0, skip: 0, opId: marker.id, hash: "" }]);
  });
});
