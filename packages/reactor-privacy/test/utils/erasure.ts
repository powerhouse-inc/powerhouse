import {
  addRelationshipAction,
  ChannelError,
  ChannelErrorSource,
  DriveCollectionId,
  SyncOperation,
  trimMailboxFromAckOrdinal,
  type IChannelFactory,
  type ISyncManager,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  DOCUMENT_PURGE_PROTOCOL,
  generateId,
  localPeerManifest,
  PEER_CAPABILITIES,
  withSignaturePolicy,
  type PeerManifest,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { sql, type Kysely } from "kysely";
import { expect, vi } from "vitest";
import {
  createModuleErasure,
  runReactorPrivacyMigrations,
  type ErasureDb,
  type ErasureScheduler,
  type ErasureService,
  type IDocumentPermissionEraser,
} from "../../index.js";
import type { DroppingEventBus } from "./dropping-event-bus.js";
import { createP256Signer, type TestSigner } from "./p256-signer.js";
import {
  createTestDatabase,
  settled,
  startReactor,
  type TestDatabase,
  type TestReactor,
} from "./reactor.js";

export const SECRET = "reactor-privacy-test-deployment-secret-0123456789";
export const HOST_ADDRESS = "0x00000000000000000000000000000000000000e1";
export const ADMIN = "0xAdAd00000000000000000000000000000000AdAd";
export const HOUR = 60 * 60 * 1000;
export const FILTER = { documentId: [], scope: [], branch: "main" };
export const POLLING = { type: "polling", parameters: {} };
export const FULL_MANIFEST: PeerManifest = localPeerManifest(
  PEER_CAPABILITIES,
  {},
);
export const MANIFEST_WITHOUT_PURGE: PeerManifest = localPeerManifest(
  PEER_CAPABILITIES.filter((c) => c.name !== DOCUMENT_PURGE_PROTOCOL),
  {},
);
export const IDENTIFIER = /0x[0-9a-f]{40}|did:key:z[1-9A-HJ-NP-Za-km-z]+/i;

export class RecordingEraser implements IDocumentPermissionEraser {
  readonly calls: string[] = [];
  failures = 0;

  erasePermissions(documentId: string): Promise<Record<string, number>> {
    this.calls.push(documentId);
    if (this.failures > 0) {
      this.failures--;
      return Promise.reject(
        new Error(`permission store unreachable for ${ADMIN}`),
      );
    }
    return Promise.resolve({ DocumentPermission: 1, DocumentProtection: 1 });
  }
}

export type Env = {
  database: TestDatabase;
  host: TestReactor;
  signer: TestSigner;
  service: ErasureService;
  scheduler: ErasureScheduler;
  eraser: RecordingEraser;
  advance: (ms: number) => void;
  now: () => Date;
};

let databases = 0;
let env: Env | undefined;

export async function setup(
  options: {
    sync?: boolean;
    eventBus?: DroppingEventBus;
    markerGraceMs?: number;
    maxPurgeOperations?: number;
  } = {},
): Promise<Env> {
  const database = await createTestDatabase(
    `reactor_privacy_erasure_${process.pid}_${++databases}`,
  );
  const signer = await createP256Signer(HOST_ADDRESS);
  const host = await startReactor(database, {
    signer,
    sync: options.sync,
    eventBus: options.eventBus,
    sweepIntervalMs: 50,
    maxPurgeOperations: options.maxPurgeOperations,
  });
  const migrated = await runReactorPrivacyMigrations(
    host.db as unknown as Kysely<unknown>,
  );
  expect(migrated.success).toBe(true);
  let offset = 0;
  const now = () => new Date(Date.now() + offset);
  const eraser = new RecordingEraser();
  const { service, scheduler } = createModuleErasure(host.module, {
    deploymentSecret: SECRET,
    signer,
    permissions: eraser,
    markerGraceMs: options.markerGraceMs,
    maxPurgeOperations: options.maxPurgeOperations,
    now,
  });
  env = {
    database,
    host,
    signer,
    service,
    scheduler,
    eraser,
    advance: (ms) => {
      offset += ms;
    },
    now,
  };
  return env;
}

/** Restarts the reactor and the erasure over the same database and clock. */
export async function restart(
  e: Env,
  options: { channelFactory?: IChannelFactory; markerGraceMs?: number } = {},
): Promise<void> {
  await e.scheduler.stop();
  await e.host.kill();
  e.host = await startReactor(e.database, {
    signer: e.signer,
    sync: true,
    channelFactory: options.channelFactory,
    sweepIntervalMs: 50,
  });
  const { service, scheduler } = createModuleErasure(e.host.module, {
    deploymentSecret: SECRET,
    signer: e.signer,
    permissions: e.eraser,
    markerGraceMs: options.markerGraceMs,
    now: e.now,
  });
  e.service = service;
  e.scheduler = scheduler;
}

/** Tears down the env the last setup() built. */
export async function teardown(): Promise<void> {
  const current = env;
  env = undefined;
  if (!current) return;
  try {
    await current.scheduler.stop();
    await current.host.kill();
  } finally {
    await current.database.drop();
  }
}

export function legacy(document: PHDocument): PHDocument {
  return withSignaturePolicy(document, "legacy", { id: generateId() });
}

export async function createDoc(
  e: Env,
  headerKey?: JsonWebKey,
): Promise<string> {
  const document = legacy(
    documentModelDocumentModelModule.utils.createDocument() as PHDocument,
  );
  if (headerKey) document.header.sig.publicKey = headerKey;
  await settled(
    e.host.module,
    (await e.host.module.reactor.create(document)).id,
  );
  return document.header.id;
}

export async function createDrive(
  e: Env,
  children: string[] = [],
): Promise<string> {
  const drive = legacy(driveDocumentModelModule.utils.createDocument());
  await settled(e.host.module, (await e.host.module.reactor.create(drive)).id);
  const id = drive.header.id;
  for (const child of children) {
    const job = await e.host.module.reactor.execute(id, "main", [
      addRelationshipAction(id, child, "child"),
    ]);
    await settled(e.host.module, job.id);
  }
  return id;
}

export async function remove(e: Env, id: string): Promise<void> {
  await settled(
    e.host.module,
    (await e.host.module.reactor.deleteDocument(id)).id,
  );
}

export function db(e: Env): ErasureDb {
  return e.host.db.withSchema("reactor") as unknown as ErasureDb;
}

export function sync(e: Env): ISyncManager {
  return e.host.module.syncModule!.syncManager;
}

export async function addRemote(
  e: Env,
  name: string,
  driveId: string,
  manifest: PeerManifest = FULL_MANIFEST,
): Promise<void> {
  await sync(e).add(
    name,
    DriveCollectionId.forDrive(driveId),
    POLLING,
    FILTER,
    {},
    name,
    manifest,
  );
}

export async function deleteOrdinal(e: Env, id: string): Promise<number> {
  const row = await db(e)
    .selectFrom("operation_index_operations")
    .select((eb) => eb.fn.max("ordinal").as("ordinal"))
    .where("documentId", "=", id)
    .where(sql<boolean>`action->>'type' = 'DELETE_DOCUMENT'`)
    .executeTakeFirstOrThrow();
  return Number(row.ordinal);
}

export async function outboxCursor(e: Env, name: string): Promise<number> {
  const row = await db(e)
    .selectFrom("sync_cursors")
    .select("cursor_ordinal")
    .where("remote_name", "=", name)
    .where("cursor_type", "=", "outbox")
    .executeTakeFirst();
  return Number(row?.cursor_ordinal ?? 0);
}

export function served(e: Env, name: string) {
  return sync(e)
    .getByName(name)
    .channel.outbox.items.flatMap((item) => item.operations);
}

/** The poller acknowledges everything through `ordinal`, once it is served. */
export async function ackThrough(
  e: Env,
  name: string,
  ordinal: number,
): Promise<void> {
  await vi.waitUntil(
    () => served(e, name).some((op) => op.context.ordinal >= ordinal),
    { timeout: 10_000, interval: 20 },
  );
  trimMailboxFromAckOrdinal(sync(e).getByName(name).channel.outbox, ordinal);
  await vi.waitUntil(async () => (await outboxCursor(e, name)) >= ordinal, {
    timeout: 10_000,
    interval: 20,
  });
}

/** The remote reports it refused the marker, as a pushed one's report lands. */
export async function refuseMarker(
  e: Env,
  remote: string,
  documentId: string,
  message = "refused",
): Promise<void> {
  const syncOp = new SyncOperation(
    crypto.randomUUID(),
    crypto.randomUUID(),
    [],
    remote,
    documentId,
    ["document"],
    "main",
    [],
  );
  syncOp.failed(
    new ChannelError(
      ChannelErrorSource.Outbox,
      new Error(message),
      "MARKER_REFUSED",
    ),
  );
  sync(e).getByName(remote).channel.deadLetter.add(syncOp);
  await vi.waitUntil(
    async () =>
      (await db(e)
        .selectFrom("sync_purge_refusals")
        .select("document_id")
        .where("remote_name", "=", remote)
        .where("document_id", "=", documentId)
        .executeTakeFirst()) !== undefined,
    { timeout: 10_000, interval: 20 },
  );
}

export async function item(e: Env, requestId: string, documentId: string) {
  const request = await e.service.status(requestId);
  return request.items.find((i) => i.documentId === documentId)!;
}

export type PendingRemote = { remote: string; state: string };

export type AuditDetail = {
  stage?: string;
  kind?: string;
  pending?: PendingRemote[];
  refused?: string[];
  remotes?: string[];
  members?: string[];
  [key: string]: unknown;
};

export type AuditEntry = {
  documentId: string | null;
  event: string;
  detail: AuditDetail;
};

export async function audit(e: Env, requestId: string): Promise<AuditEntry[]> {
  const rows = await db(e)
    .selectFrom("erasure_audit")
    .select(["documentId", "event", "detail"])
    .where("requestId", "=", requestId)
    .orderBy("ordinal")
    .execute();
  return rows.map((row) => ({
    documentId: row.documentId,
    event: row.event,
    detail: (row.detail ?? {}) as AuditDetail,
  }));
}

export async function events(
  e: Env,
  requestId: string,
  documentId: string | null,
) {
  return (await audit(e, requestId))
    .filter((row) => row.documentId === documentId)
    .map((row) => row.event);
}

export async function tickUntil(
  e: Env,
  what: string,
  predicate: () => Promise<boolean>,
  timeout = 20_000,
): Promise<void> {
  try {
    await vi.waitUntil(
      async () => {
        await e.scheduler.tick();
        return predicate();
      },
      { timeout, interval: 50 },
    );
  } catch (error) {
    throw new Error(`never reached: ${what}`, { cause: error });
  }
}

export const statusIs =
  (e: Env, requestId: string, documentId: string, status: string) => async () =>
    (await item(e, requestId, documentId)).status === status;

export async function expectNoIdentifiers(e: Env): Promise<void> {
  const tables = ["erasure_audit", "erasure_items", "erasure_requests"];
  for (const table of tables) {
    const rows = await db(e)
      .selectFrom(table as "erasure_audit")
      .selectAll()
      .execute();
    expect(JSON.stringify(rows), table).not.toMatch(IDENTIFIER);
  }
}
