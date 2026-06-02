import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Kysely } from "kysely";
import type { KyselyAttachmentStore } from "../../../src/storage/kysely/attachment-store.js";
import type { KyselyReservationStore } from "../../../src/storage/kysely/reservation-store.js";
import type { AttachmentDatabase } from "../../../src/storage/kysely/types.js";
import { AttachmentNotFound, AttachmentPending } from "../../../src/errors.js";
import type { MockTransport } from "../../factories.js";
import {
  createTestAttachmentStore,
  streamFromString,
  computeHash,
} from "../../factories.js";

const TEST_CONTENT = "pending attachment content";
const TEST_BYTES = new TextEncoder().encode(TEST_CONTENT);
const TEST_HASH = computeHash(TEST_BYTES);
const TEST_MIME_TYPE = "text/plain";
const TEST_FILE_NAME = "pending.txt";
const TEST_SIZE = TEST_BYTES.byteLength;
const TEST_CREATED_AT = "2024-01-01T00:00:00.000Z";
const TEST_METADATA = {
  mimeType: TEST_MIME_TYPE,
  fileName: TEST_FILE_NAME,
  sizeBytes: TEST_SIZE,
  extension: ".txt",
  createdAtUtc: TEST_CREATED_AT,
};

async function insertReservation(
  db: Kysely<AttachmentDatabase>,
  opts: {
    clientHash: string;
    mimeType?: string;
    fileName?: string;
    extension?: string | null;
    sizeBytes?: number;
    expiresAtUtc: string;
    deletedAtUtc?: string | null;
  },
): Promise<string> {
  const id = `test-reservation-${Math.random().toString(36).slice(2)}`;
  await db
    .insertInto("attachment_reservation")
    .values({
      reservation_id: id,
      mime_type: opts.mimeType ?? TEST_MIME_TYPE,
      file_name: opts.fileName ?? TEST_FILE_NAME,
      extension: opts.extension ?? ".txt",
      created_at_utc: TEST_CREATED_AT,
      expires_at_utc: opts.expiresAtUtc,
      deleted_at_utc: opts.deletedAtUtc ?? null,
      client_hash: opts.clientHash,
      size_bytes: opts.sizeBytes ?? TEST_SIZE,
    })
    .execute();
  return id;
}

describe("KyselyAttachmentStore: stat() with pending reservations", () => {
  let store: KyselyAttachmentStore;
  let reservationStore: KyselyReservationStore;
  let db: Kysely<AttachmentDatabase>;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestAttachmentStore();
    store = setup.store;
    reservationStore = setup.reservationStore;
    db = setup.db;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("returns pending header for a live unexpired hash-bearing reservation", async () => {
    const futureExpiry = new Date(Date.now() + 60_000).toISOString();
    await insertReservation(db, {
      clientHash: TEST_HASH,
      expiresAtUtc: futureExpiry,
    });

    const header = await store.stat(TEST_HASH);

    expect(header.status).toBe("pending");
    expect(header.hash).toBe(TEST_HASH);
    expect(header.sizeBytes).toBe(TEST_SIZE);
    expect(header.mimeType).toBe(TEST_MIME_TYPE);
    expect(header.fileName).toBe(TEST_FILE_NAME);
    expect(header.expiresAtUtc).toBe(futureExpiry);
  });

  it("throws AttachmentNotFound once expires_at_utc has passed (time-bounded without sweep)", async () => {
    const pastExpiry = new Date(Date.now() - 1).toISOString();
    await insertReservation(db, {
      clientHash: TEST_HASH,
      expiresAtUtc: pastExpiry,
    });

    await expect(store.stat(TEST_HASH)).rejects.toThrow(AttachmentNotFound);
  });

  it("throws AttachmentNotFound after the reservation is soft-deleted", async () => {
    const futureExpiry = new Date(Date.now() + 60_000).toISOString();
    const reservationId = await insertReservation(db, {
      clientHash: TEST_HASH,
      expiresAtUtc: futureExpiry,
    });

    await reservationStore.delete(reservationId);

    await expect(store.stat(TEST_HASH)).rejects.toThrow(AttachmentNotFound);
  });

  it("committed attachment row wins over a live reservation (no pending once row exists)", async () => {
    await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));

    const futureExpiry = new Date(Date.now() + 60_000).toISOString();
    await insertReservation(db, {
      clientHash: TEST_HASH,
      expiresAtUtc: futureExpiry,
    });

    const header = await store.stat(TEST_HASH);

    expect(header.status).toBe("available");
    expect(header.expiresAtUtc).toBeNull();
  });

  it("multiple live reservations for the same hash: greatest expiry wins", async () => {
    const soonerExpiry = new Date(Date.now() + 30_000).toISOString();
    const laterExpiry = new Date(Date.now() + 120_000).toISOString();

    await insertReservation(db, {
      clientHash: TEST_HASH,
      expiresAtUtc: soonerExpiry,
    });
    await insertReservation(db, {
      clientHash: TEST_HASH,
      expiresAtUtc: laterExpiry,
    });

    const header = await store.stat(TEST_HASH);

    expect(header.status).toBe("pending");
    expect(header.expiresAtUtc).toBe(laterExpiry);
  });

  it("committed attachment has expiresAtUtc null", async () => {
    await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));

    const header = await store.stat(TEST_HASH);

    expect(header.expiresAtUtc).toBeNull();
  });

  it("throws AttachmentNotFound for a completely unknown hash", async () => {
    await expect(store.stat("unknown-hash")).rejects.toThrow(
      AttachmentNotFound,
    );
  });
});

describe("KyselyAttachmentStore: get() with pending reservations", () => {
  let store: KyselyAttachmentStore;
  let db: Kysely<AttachmentDatabase>;
  let transport: MockTransport;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestAttachmentStore();
    store = setup.store;
    db = setup.db;
    transport = setup.transport;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("throws AttachmentPending for a live pending hash (no attachment row)", async () => {
    const futureExpiry = new Date(Date.now() + 60_000).toISOString();
    await insertReservation(db, {
      clientHash: TEST_HASH,
      expiresAtUtc: futureExpiry,
    });

    const err = await store.get(TEST_HASH).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AttachmentPending);
    expect((err as AttachmentPending).hash).toBe(TEST_HASH);
    expect((err as AttachmentPending).expiresAtUtc).toBe(futureExpiry);
  });

  it("AttachmentPending carries the reservation expiresAtUtc verbatim", async () => {
    const futureExpiry = new Date(Date.now() + 90_000).toISOString();
    await insertReservation(db, {
      clientHash: TEST_HASH,
      expiresAtUtc: futureExpiry,
    });

    await expect(store.get(TEST_HASH)).rejects.toMatchObject({
      name: "AttachmentPending",
      hash: TEST_HASH,
      expiresAtUtc: futureExpiry,
    });
  });

  it("evicted + transport returns pending -> throws AttachmentPending", async () => {
    await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));
    await store.evict(TEST_HASH);

    const pendingExpiry = new Date(Date.now() + 60_000).toISOString();
    transport.fetch.mockResolvedValueOnce({
      kind: "pending",
      hash: TEST_HASH,
      expiresAtUtc: pendingExpiry,
      retryAfterMs: 5000,
    });

    const err = await store.get(TEST_HASH).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AttachmentPending);
    expect((err as AttachmentPending).expiresAtUtc).toBe(pendingExpiry);
  });

  it("evicted + transport returns data -> restores and returns response", async () => {
    await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));
    await store.evict(TEST_HASH);

    transport.fetch.mockResolvedValueOnce({
      kind: "data",
      response: {
        hash: TEST_HASH,
        metadata: TEST_METADATA,
        body: streamFromString(TEST_CONTENT),
      },
    });

    const response = await store.get(TEST_HASH);

    expect(response.header.hash).toBe(TEST_HASH);
    expect(response.header.status).toBe("available");
    await response.body.cancel();
  });

  it("evicted + transport returns not-found -> throws AttachmentNotFound", async () => {
    await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));
    await store.evict(TEST_HASH);

    transport.fetch.mockResolvedValueOnce({ kind: "not-found" });

    await expect(store.get(TEST_HASH)).rejects.toThrow(AttachmentNotFound);
  });

  it("unknown hash + transport returns data -> lazy fetch stores and serves", async () => {
    transport.fetch.mockResolvedValueOnce({
      kind: "data",
      response: {
        hash: TEST_HASH,
        metadata: TEST_METADATA,
        body: streamFromString(TEST_CONTENT),
      },
    });

    const response = await store.get(TEST_HASH);

    expect(response.header.hash).toBe(TEST_HASH);
    expect(response.header.status).toBe("available");

    await response.body.cancel();

    expect(await store.has(TEST_HASH)).toBe(true);
  });

  it("unknown hash + transport returns not-found -> throws AttachmentNotFound", async () => {
    transport.fetch.mockResolvedValueOnce({ kind: "not-found" });

    await expect(store.get(TEST_HASH)).rejects.toThrow(AttachmentNotFound);
  });

  it("does not call transport for a locally pending hash", async () => {
    const futureExpiry = new Date(Date.now() + 60_000).toISOString();
    await insertReservation(db, {
      clientHash: TEST_HASH,
      expiresAtUtc: futureExpiry,
    });

    await store.get(TEST_HASH).catch(() => {});

    expect(transport.fetch).not.toHaveBeenCalled();
  });
});

describe("KyselyAttachmentStore: has() with pending reservations", () => {
  let store: KyselyAttachmentStore;
  let db: Kysely<AttachmentDatabase>;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestAttachmentStore();
    store = setup.store;
    db = setup.db;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("returns false for a pending hash (live reservation, no attachment row)", async () => {
    const futureExpiry = new Date(Date.now() + 60_000).toISOString();
    await insertReservation(db, {
      clientHash: TEST_HASH,
      expiresAtUtc: futureExpiry,
    });

    expect(await store.has(TEST_HASH)).toBe(false);
  });

  it("returns false for an expired reservation with no attachment row", async () => {
    const pastExpiry = new Date(Date.now() - 1).toISOString();
    await insertReservation(db, {
      clientHash: TEST_HASH,
      expiresAtUtc: pastExpiry,
    });

    expect(await store.has(TEST_HASH)).toBe(false);
  });

  it("returns true once the attachment is committed (no longer pending)", async () => {
    const futureExpiry = new Date(Date.now() + 60_000).toISOString();
    await insertReservation(db, {
      clientHash: TEST_HASH,
      expiresAtUtc: futureExpiry,
    });

    expect(await store.has(TEST_HASH)).toBe(false);

    await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));

    expect(await store.has(TEST_HASH)).toBe(true);
  });
});
