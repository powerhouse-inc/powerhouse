import {
  driveDocumentModelModule,
  setDriveName,
} from "@powerhousedao/shared/document-drive";
import {
  generateId,
  initializeAuth,
  withSignaturePolicy,
  type Grant,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  ConsistencyTracker,
  type DocumentViewDatabase,
} from "@powerhousedao/reactor";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  DisclosureService,
  registerSubjectDocumentsReadModel,
  SUBJECT_DOCUMENTS_READ_MODEL_ID,
  SubjectDocumentsReadModel,
  type IPermissionRowsLookup,
  type PermissionRow,
  type SubjectDocument,
} from "../index.js";
import { DroppingEventBus } from "./utils/dropping-event-bus.js";
import {
  createP256Signer,
  signedBy,
  type TestSigner,
} from "./utils/p256-signer.js";
import {
  createTestDatabase,
  settled,
  startReactor,
  type TestDatabase,
  type TestReactor,
} from "./utils/reactor.js";

const SECRET = "reactor-privacy-test-deployment-secret-0123456789";
const ADDRESS_A = "0xAaAa00000000000000000000000000000000aAaA";
const ADDRESS_B = "0xBbBb00000000000000000000000000000000bBbB";
const ADDRESS_C = "0xCcCc00000000000000000000000000000000cCcC";

function legacyDrive(): PHDocument {
  return withSignaturePolicy(
    driveDocumentModelModule.utils.createDocument(),
    "legacy",
    { id: generateId() },
  );
}

function grantTo(address: string): Grant {
  return {
    id: "g-named",
    description: "the named address executes global",
    effect: "allow",
    principal: { address },
    capability: { can: "execute", scope: "global" },
  } as Grant;
}

function roles(documents: SubjectDocument[]): [string, string][] {
  return documents.map(({ documentId, role }) => [documentId, role]);
}

function sorted(pairs: [string, string][]): [string, string][] {
  return [...pairs].sort(
    (a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]),
  );
}

async function create(
  host: TestReactor,
  document: PHDocument,
  signer: TestSigner,
): Promise<string> {
  await settled(
    host.module,
    (await host.module.reactor.create(document, signer)).id,
  );
  return document.header.id;
}

async function rename(
  host: TestReactor,
  documentId: string,
  name: string,
  signer: TestSigner,
): Promise<void> {
  const job = await host.module.reactor.execute(documentId, "main", [
    await signedBy(signer, setDriveName({ name }), documentId),
  ]);
  await settled(host.module, job.id);
}

async function purge(host: TestReactor, documentId: string): Promise<void> {
  await settled(
    host.module,
    (await host.module.reactor.deleteDocument(documentId)).id,
  );
  await host.module.documentPurgeService.enqueuePurge([documentId], "req-1");
  await waitForTombstone(host.db, documentId);
}

async function waitForTombstone(db: Kysely<any>, documentId: string) {
  await vi.waitUntil(
    async () =>
      (await db
        .withSchema("reactor")
        .selectFrom("document_purges")
        .select("documentId")
        .where("documentId", "=", documentId)
        .executeTakeFirst()) !== undefined,
    { timeout: 20_000, interval: 20 },
  );
}

async function indexRows(db: Kysely<any>, documentId: string) {
  const row = await db
    .withSchema("reactor")
    .selectFrom("subject_documents")
    .select((eb) => eb.fn.countAll().as("count"))
    .where("documentId", "=", documentId)
    .executeTakeFirstOrThrow();
  return Number((row as { count: string | number }).count);
}

/** Delivers a batch through the base's fence, as a late sweep would. */
class FenceProbe extends SubjectDocumentsReadModel {
  deliver(items: OperationWithContext[]): Promise<void> {
    return this.commitFenced(items);
  }
}

function probeOn(host: TestReactor): FenceProbe {
  return new FenceProbe(
    host.db.withSchema("reactor") as unknown as Kysely<DocumentViewDatabase>,
    host.module.operationIndex,
    host.module.writeCache,
    new ConsistencyTracker(),
    SECRET,
  );
}

async function streamOf(
  host: TestReactor,
  documentId: string,
): Promise<OperationWithContext[]> {
  const read = (scope: string) =>
    host.module.operationIndex.getStreamAfter(
      { documentId, scope, branch: "main" },
      0,
    );
  return [...(await read("document")), ...(await read("global"))];
}

class StubPermissions implements IPermissionRowsLookup {
  readonly asked: string[] = [];

  rowsForAddress(address: string): Promise<PermissionRow[]> {
    this.asked.push(address);
    if (address.toLowerCase() !== ADDRESS_A.toLowerCase()) {
      return Promise.resolve([]);
    }
    return Promise.resolve([
      {
        table: "DocumentPermission",
        column: "userAddress",
        documentId: "doc-in-api",
        detail: { permission: "ADMIN" },
      },
    ]);
  }
}

describe("disclosure [Postgres]", () => {
  let database: TestDatabase;
  let host: TestReactor;
  let signerA: TestSigner;
  let signerB: TestSigner;
  let permissions: StubPermissions;
  let disclosure: DisclosureService;
  let doc1: string;
  let doc2: string;
  let doc3: string;

  beforeAll(async () => {
    database = await createTestDatabase("reactor_privacy_disclosure");
    signerA = await createP256Signer(ADDRESS_A);
    signerB = await createP256Signer(ADDRESS_B);
    host = await startReactor(database, {
      signer: await createP256Signer(
        "0x0000000000000000000000000000000000000001",
      ),
    });
    await registerSubjectDocumentsReadModel(host.module, {
      deploymentSecret: SECRET,
    });
    permissions = new StubPermissions();
    disclosure = new DisclosureService(host.db, SECRET, permissions);

    const signed = legacyDrive();
    signed.header.sig.publicKey = signerA.jwk;
    doc1 = await create(host, signed, signerA);
    await rename(host, doc1, "one", signerA);
    const init = await host.module.reactor.execute(doc1, "main", [
      await signedBy(
        signerA,
        initializeAuth({ version: 1, grants: [grantTo(ADDRESS_C)] }),
        doc1,
      ),
    ]);
    await settled(host.module, init.id);

    doc2 = await create(host, legacyDrive(), signerA);
    await rename(host, doc2, "two", signerB);

    doc3 = await create(host, legacyDrive(), signerB);
    await rename(host, doc3, "three", signerB);

    await host.db
      .withSchema("reactor")
      .insertInto("sync_remotes")
      .values([
        {
          name: "r-bound",
          collection_id: "c-1",
          channel_type: "gql",
          bound_address: ADDRESS_A.toUpperCase().replace("0X", "0x"),
        },
        {
          name: "r-peer",
          collection_id: "c-1",
          channel_type: "gql",
          peer_manifest: JSON.stringify({ format: 1, appKey: signerB.did }),
          peer_manifest_at_utc_ms: 1234,
        },
        {
          name: "r-malformed",
          collection_id: "c-1",
          channel_type: "gql",
          peer_manifest: "{not json",
          peer_manifest_at_utc_ms: 99,
        },
      ] as never)
      .execute();
  });

  afterAll(async () => {
    try {
      await host.kill();
    } finally {
      await database.drop();
    }
  });

  it("accepts the header key holder's INITIALIZE_AUTH", async () => {
    const operations = await host.module.reactor.getOperations(doc1);
    const auth = operations.auth.results;
    expect(auth.map((op) => op.action.type)).toEqual(["INITIALIZE_AUTH"]);
    expect(auth[0].error).toBeUndefined();
  });

  it("lists each signer's documents by role, case-insensitively", async () => {
    const a = await disclosure.disclose(ADDRESS_A);
    expect(roles(a.documents)).toEqual(
      sorted([
        [doc1, "signer"],
        [doc2, "signer"],
      ]),
    );
    const b = await disclosure.disclose(ADDRESS_B.toLowerCase());
    expect(roles(b.documents)).toEqual(
      sorted([
        [doc2, "signer"],
        [doc3, "signer"],
      ]),
    );
    expect(await disclosure.disclose(ADDRESS_A.toLowerCase())).toEqual(a);
    expect(
      await disclosure.disclose(ADDRESS_A.toUpperCase().replace("0X", "0x")),
    ).toEqual(a);
    const signedByA = (await streamOf(host, doc1)).map(
      (op) => op.context.ordinal,
    );
    const [authOp] = await host.module.operationIndex.getStreamAfter(
      { documentId: doc1, scope: "auth", branch: "main" },
      0,
    );
    const ordinals = [...signedByA, authOp.context.ordinal];
    expect(a.documents.find((row) => row.documentId === doc1)).toMatchObject({
      firstOrdinal: Math.min(...ordinals),
      lastOrdinal: Math.max(...ordinals),
    });
  });

  it("lists an app key's documents, its header key and its auth creation", async () => {
    const a = await disclosure.disclose(signerA.did);
    expect(roles(a.documents)).toEqual(
      sorted([
        [doc1, "app-key"],
        [doc1, "creator"],
        [doc1, "header-key"],
        [doc2, "app-key"],
      ]),
    );
    const b = await disclosure.disclose(signerB.did);
    expect(roles(b.documents)).toEqual(
      sorted([
        [doc2, "app-key"],
        [doc3, "app-key"],
      ]),
    );
  });

  it("lists an address named in a grant", async () => {
    const c = await disclosure.disclose(ADDRESS_C.toLowerCase());
    expect(roles(c.documents)).toEqual([[doc1, "named"]]);
    expect(c.boundSyncRemotes).toEqual([]);
    expect(c.peerManifests).toEqual([]);
  });

  it("lists the non-document homes and names what it does not cover", async () => {
    const a = await disclosure.disclose(ADDRESS_A.toLowerCase());
    expect(a.boundSyncRemotes).toEqual([
      { name: "r-bound", collectionId: "c-1", channelType: "gql" },
    ]);
    expect(a.permissions).toEqual([
      {
        table: "DocumentPermission",
        column: "userAddress",
        documentId: "doc-in-api",
        detail: { permission: "ADMIN" },
      },
    ]);
    expect(a.notCovered.length).toBeGreaterThan(0);

    const b = await disclosure.disclose(signerB.did.toLowerCase());
    expect(b.peerManifests).toEqual([
      { remoteName: "r-peer", appKey: signerB.did, heardAtUtcMs: 1234 },
    ]);
    expect(b.permissions).toEqual([]);

    const unconfigured = new DisclosureService(host.db, SECRET);
    const bare = await unconfigured.disclose(ADDRESS_A);
    expect(bare.permissions).toEqual([]);
    expect(bare.notCovered.some((line) => line.includes("permission"))).toBe(
      true,
    );
  });

  it("stores only keyed hashes, never the identifier", async () => {
    const rows = await host.db
      .withSchema("reactor")
      .selectFrom("subject_documents" as never)
      .select(sql<string>`"subjectHash"`.as("subjectHash"))
      .execute();
    const hashes = rows.map(
      (row) => (row as { subjectHash: string }).subjectHash,
    );
    expect(hashes.length).toBeGreaterThan(0);
    for (const hash of hashes) {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    }
    const a = await disclosure.disclose(ADDRESS_A);
    expect(hashes).toContain(a.subjectHash);
  });

  it("drops a document's rows once it is purged, and a late batch cannot restore them", async () => {
    expect(await indexRows(host.db, doc2)).toBeGreaterThan(0);
    const stale = await streamOf(host, doc2);
    expect(stale.length).toBeGreaterThan(0);
    await purge(host, doc2);
    await vi.waitUntil(async () => (await indexRows(host.db, doc2)) === 0, {
      timeout: 20_000,
      interval: 20,
    });

    const a = await disclosure.disclose(ADDRESS_A);
    expect(roles(a.documents)).toEqual([[doc1, "signer"]]);
    const b = await disclosure.disclose(signerB.did);
    expect(roles(b.documents)).toEqual([[doc3, "app-key"]]);
    expect(await indexRows(host.db, doc1)).toBeGreaterThan(0);

    const probe = probeOn(host);
    await probe.deliver(stale);
    expect(await indexRows(host.db, doc2)).toBe(0);

    const live = await streamOf(host, doc3);
    const before = await indexRows(host.db, doc3);
    await host.db
      .withSchema("reactor")
      .deleteFrom("subject_documents" as never)
      .where(sql.ref("documentId"), "=", doc3)
      .execute();
    await probe.deliver(live);
    expect(await indexRows(host.db, doc3)).toBe(before);
  });
});

describe("the subject index as a fenced read model [Postgres]", () => {
  let database: TestDatabase;
  let hostSigner: TestSigner;
  let signerA: TestSigner;
  let signerB: TestSigner;

  beforeAll(async () => {
    database = await createTestDatabase("reactor_privacy_catchup");
    hostSigner = await createP256Signer(
      "0x0000000000000000000000000000000000000002",
    );
    signerA = await createP256Signer(ADDRESS_A);
    signerB = await createP256Signer(ADDRESS_B);
  });

  afterAll(async () => {
    await database.drop();
  });

  it("applies a marker whose write-ready was dropped from the sweep, and resumes after a restart", async () => {
    const bus = new DroppingEventBus();
    // Only sweepNow may apply the dropped marker; a scheduled tick would race it.
    const first = await startReactor(database, {
      signer: hostSigner,
      eventBus: bus,
      sweepIntervalMs: 3_600_000,
    });
    const disclosure = new DisclosureService(first.db, SECRET);
    await registerSubjectDocumentsReadModel(first.module, {
      deploymentSecret: SECRET,
    });
    expect(
      first.module.readModelCoordinator
        .indexedReadModels?.()
        .some((model) => model.name === SUBJECT_DOCUMENTS_READ_MODEL_ID),
    ).toBe(true);

    const kept = await create(first, legacyDrive(), signerA);
    const swept = await create(first, legacyDrive(), signerA);
    await rename(first, swept, "swept", signerA);
    expect(await indexRows(first.db, swept)).toBeGreaterThan(0);

    await settled(
      first.module,
      (await first.module.reactor.deleteDocument(swept)).id,
    );
    const dropped = bus.dropWriteReadyFor(swept);
    await first.module.documentPurgeService.enqueuePurge([swept], "req-2");
    const event = await dropped;
    expect(event.operations.map((op) => op.operation.action.type)).toEqual([
      "PURGE_DOCUMENT",
    ]);
    await waitForTombstone(first.db, swept);
    expect(await indexRows(first.db, swept)).toBeGreaterThan(0);

    await vi.waitUntil(
      async () => {
        await first.module.catchUp.sweepNow();
        return (await indexRows(first.db, swept)) === 0;
      },
      { timeout: 20_000, interval: 50 },
    );
    expect(roles((await disclosure.disclose(ADDRESS_A)).documents)).toEqual([
      [kept, "signer"],
    ]);

    const cursorBefore = await viewStateCursor(first.db);
    expect(cursorBefore).toBeGreaterThan(0);
    await first.kill();

    const second = await startReactor(database, { signer: hostSigner });
    const later = await create(second, legacyDrive(), signerB);
    await settled(
      second.module,
      (await second.module.reactor.deleteDocument(kept)).id,
    );
    await second.module.documentPurgeService.enqueuePurge([kept], "req-3");
    await waitForTombstone(second.db, kept);
    expect(await indexRows(second.db, later)).toBe(0);
    expect(await indexRows(second.db, kept)).toBeGreaterThan(0);

    await registerSubjectDocumentsReadModel(second.module, {
      deploymentSecret: SECRET,
    });
    expect(await indexRows(second.db, kept)).toBe(0);
    const again = new DisclosureService(second.db, SECRET);
    expect(roles((await again.disclose(ADDRESS_B)).documents)).toEqual([
      [later, "signer"],
    ]);
    expect(await again.disclose(ADDRESS_A)).toMatchObject({ documents: [] });
    expect(await viewStateCursor(second.db)).toBeGreaterThan(cursorBefore);
    await second.kill();
  });
});

async function viewStateCursor(db: Kysely<any>): Promise<number> {
  const row = await db
    .withSchema("reactor")
    .selectFrom("ViewState")
    .select("lastOrdinal")
    .where("readModelId", "=", SUBJECT_DOCUMENTS_READ_MODEL_ID)
    .executeTakeFirstOrThrow();
  return Number((row as { lastOrdinal: string | number }).lastOrdinal);
}
