import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PGlite } from "@electric-sql/pglite";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { vi } from "vitest";
import type { Mock } from "vitest";
import type {
  IAttachmentStore,
  IAttachmentTransport,
  IAttachmentUploadFactory,
  IReservationStore,
} from "../src/interfaces.js";
import { KyselyAttachmentStore } from "../src/storage/kysely/attachment-store.js";
import { KyselyReservationStore } from "../src/storage/kysely/reservation-store.js";
import type { AttachmentDatabase } from "../src/storage/kysely/types.js";
import {
  runAttachmentMigrations,
  ATTACHMENT_SCHEMA,
} from "../src/storage/migrations/migrator.js";

export type MockTransport = IAttachmentTransport & {
  fetch: Mock;
  announce: Mock;
  push: Mock;
};

export function createMockTransport(
  overrides: Partial<IAttachmentTransport> = {},
): MockTransport {
  return {
    fetch: vi.fn().mockResolvedValue(null),
    announce: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as MockTransport;
}

export type MockStore = IAttachmentStore & {
  stat: Mock;
  has: Mock;
  get: Mock;
  put: Mock;
  evict: Mock;
  storageUsed: Mock;
};

export function createMockStore(
  overrides: Partial<IAttachmentStore> = {},
): MockStore {
  return {
    stat: vi.fn(),
    has: vi.fn().mockResolvedValue(false),
    get: vi.fn(),
    put: vi.fn().mockResolvedValue(undefined),
    evict: vi.fn().mockResolvedValue(undefined),
    storageUsed: vi.fn().mockResolvedValue(0),
    ...overrides,
  } as MockStore;
}

export type MockReservationStore = IReservationStore & {
  create: Mock;
  get: Mock;
  delete: Mock;
};

export function createMockReservationStore(
  overrides: Partial<IReservationStore> = {},
): MockReservationStore {
  return {
    create: vi.fn(),
    get: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as MockReservationStore;
}

export type MockUploadFactory = IAttachmentUploadFactory & {
  createUpload: Mock;
};

export function createMockUploadFactory(): MockUploadFactory {
  return {
    createUpload: vi.fn().mockReturnValue({
      reservationId: "mock-reservation-id",
      send: vi.fn(),
    }),
  } as MockUploadFactory;
}

async function createTestDb(): Promise<{
  baseDb: Kysely<AttachmentDatabase>;
  db: Kysely<AttachmentDatabase>;
}> {
  const baseDb = new Kysely<AttachmentDatabase>({
    dialect: new PGliteDialect(new PGlite()),
  });

  const result = await runAttachmentMigrations(baseDb, ATTACHMENT_SCHEMA);
  if (!result.success && result.error) {
    throw new Error(`Test migration failed: ${result.error.message}`);
  }

  const db = baseDb.withSchema(ATTACHMENT_SCHEMA) as Kysely<AttachmentDatabase>;
  return { baseDb, db };
}

export async function createTestAttachmentStore(
  transportOverrides: Partial<IAttachmentTransport> = {},
): Promise<{
  db: Kysely<AttachmentDatabase>;
  store: KyselyAttachmentStore;
  reservationStore: KyselyReservationStore;
  transport: MockTransport;
  storagePath: string;
  cleanup: () => Promise<void>;
}> {
  const { baseDb, db } = await createTestDb();
  const storagePath = await mkdtemp(join(tmpdir(), "attachment-test-"));
  const transport = createMockTransport(transportOverrides);
  const store = new KyselyAttachmentStore(db, transport, storagePath);
  const reservationStore = new KyselyReservationStore(db);

  const cleanup = async () => {
    await baseDb.destroy();
    await rm(storagePath, { recursive: true, force: true });
  };

  return { db, store, reservationStore, transport, storagePath, cleanup };
}

export async function createTestReservationStore(): Promise<{
  db: Kysely<AttachmentDatabase>;
  reservationStore: KyselyReservationStore;
  cleanup: () => Promise<void>;
}> {
  const { baseDb, db } = await createTestDb();
  const reservationStore = new KyselyReservationStore(db);

  const cleanup = async () => {
    await baseDb.destroy();
  };

  return { db, reservationStore, cleanup };
}

export function streamFromBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

export function streamFromString(str: string): ReadableStream<Uint8Array> {
  return streamFromBytes(new TextEncoder().encode(str));
}

export async function streamToBytes(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export function computeHash(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}
