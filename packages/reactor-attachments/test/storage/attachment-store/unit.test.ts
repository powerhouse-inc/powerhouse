import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { AttachmentHash } from "@powerhousedao/reactor";
import type { KyselyAttachmentStore } from "../../../src/storage/kysely/attachment-store.js";
import type { KyselyReservationStore } from "../../../src/storage/kysely/reservation-store.js";
import { AttachmentNotFound, AttachmentPending } from "../../../src/errors.js";
import {
  storagePath,
  attachmentBytesExist,
} from "../../../src/storage/fs/attachment-fs.js";
import type { Kysely } from "kysely";
import type { AttachmentDatabase } from "../../../src/storage/kysely/types.js";
import type { MockTransport } from "../../factories.js";
import {
  createTestAttachmentStore,
  streamFromString,
  streamToBytes,
  computeHash,
} from "../../factories.js";

const TEST_CONTENT = "hello attachment world";
const TEST_BYTES = new TextEncoder().encode(TEST_CONTENT);
const TEST_HASH = computeHash(TEST_BYTES);
const TEST_CREATED_AT = "2020-01-15T12:34:56.000Z";
const TEST_METADATA = {
  mimeType: "text/plain",
  fileName: "test.txt",
  sizeBytes: TEST_BYTES.byteLength,
  extension: ".txt",
  createdAtUtc: TEST_CREATED_AT,
};

describe("KyselyAttachmentStore", () => {
  let store: KyselyAttachmentStore;
  let db: Kysely<AttachmentDatabase>;
  let transport: MockTransport;
  let reservationStore: KyselyReservationStore;
  let testStoragePath: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestAttachmentStore();
    store = setup.store;
    db = setup.db;
    transport = setup.transport;
    reservationStore = setup.reservationStore;
    testStoragePath = setup.storagePath;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("has", () => {
    it("returns false for unknown hash", async () => {
      expect(await store.has("nonexistent")).toBe(false);
    });

    it("returns true for available attachment", async () => {
      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));
      expect(await store.has(TEST_HASH)).toBe(true);
    });

    it("returns false for evicted attachment", async () => {
      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));
      await store.evict(TEST_HASH);
      expect(await store.has(TEST_HASH)).toBe(false);
    });
  });

  describe("put", () => {
    it("inserts new attachment with source=sync and status=available", async () => {
      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));

      const row = await db
        .selectFrom("attachment")
        .selectAll()
        .where("hash", "=", TEST_HASH)
        .executeTakeFirst();

      expect(row).toBeDefined();
      expect(row!.status).toBe("available");
      expect(row!.source).toBe("sync");
      expect(row!.mime_type).toBe("text/plain");
      expect(row!.file_name).toBe("test.txt");
      expect(Number(row!.size_bytes)).toBe(TEST_BYTES.byteLength);
    });

    it("writes bytes to correct fan-out path on disk", async () => {
      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));

      const expectedPath = storagePath(testStoragePath, TEST_HASH);
      expect(await attachmentBytesExist(expectedPath)).toBe(true);
    });

    it("is a no-op when attachment already available (dedup)", async () => {
      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));
      await store.put(
        TEST_HASH,
        TEST_METADATA,
        streamFromString("different content"),
      );

      const response = await store.get(TEST_HASH);
      const bytes = await streamToBytes(response.body);
      expect(new TextDecoder().decode(bytes)).toBe(TEST_CONTENT);
    });

    it("restores evicted attachment to available", async () => {
      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));
      await store.evict(TEST_HASH);
      expect(await store.has(TEST_HASH)).toBe(false);

      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));
      expect(await store.has(TEST_HASH)).toBe(true);

      const row = await db
        .selectFrom("attachment")
        .selectAll()
        .where("hash", "=", TEST_HASH)
        .executeTakeFirst();
      expect(row!.status).toBe("available");
    });

    it("preserves createdAtUtc from metadata instead of synthesizing now", async () => {
      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));

      const row = await db
        .selectFrom("attachment")
        .select("created_at_utc")
        .where("hash", "=", TEST_HASH)
        .executeTakeFirst();

      expect(row!.created_at_utc).toBe(TEST_CREATED_AT);
    });

    it("concurrent puts for same hash do not error", async () => {
      await Promise.all([
        store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT)),
        store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT)),
      ]);

      expect(await store.has(TEST_HASH)).toBe(true);
    });
  });

  describe("get", () => {
    it("returns header and body stream for available attachment", async () => {
      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));

      const response = await store.get(TEST_HASH);

      expect(response.header.hash).toBe(TEST_HASH);
      expect(response.header.mimeType).toBe("text/plain");
      expect(response.header.fileName).toBe("test.txt");
      expect(response.header.status).toBe("available");
      expect(response.header.createdAtUtc).toBe(TEST_CREATED_AT);
    });

    it("body stream contains correct bytes", async () => {
      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));

      const response = await store.get(TEST_HASH);
      const bytes = await streamToBytes(response.body);
      expect(new TextDecoder().decode(bytes)).toBe(TEST_CONTENT);
    });

    it("updates lastAccessedAtUtc on access", async () => {
      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));

      const before = await db
        .selectFrom("attachment")
        .select("last_accessed_at_utc")
        .where("hash", "=", TEST_HASH)
        .executeTakeFirst();

      await new Promise((resolve) => setTimeout(resolve, 10));

      const response = await store.get(TEST_HASH);
      await streamToBytes(response.body);

      const after = await db
        .selectFrom("attachment")
        .select("last_accessed_at_utc")
        .where("hash", "=", TEST_HASH)
        .executeTakeFirst();

      expect(after!.last_accessed_at_utc).not.toBe(
        before!.last_accessed_at_utc,
      );
    });

    it("throws AttachmentNotFound for unknown hash", async () => {
      await expect(store.get("nonexistent")).rejects.toThrow(
        AttachmentNotFound,
      );
    });

    it("lazy-fetches via transport when evicted, then returns data", async () => {
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
      const bytes = await streamToBytes(response.body);
      expect(new TextDecoder().decode(bytes)).toBe(TEST_CONTENT);
      expect(transport.fetch).toHaveBeenCalledWith(TEST_HASH, undefined);
    });

    it("throws AttachmentNotFound when evicted and transport returns not-found", async () => {
      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));
      await store.evict(TEST_HASH);

      transport.fetch.mockResolvedValueOnce({ kind: "not-found" });

      await expect(store.get(TEST_HASH)).rejects.toThrow(AttachmentNotFound);
    });
  });

  describe("stat", () => {
    it("returns header for available attachment", async () => {
      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));
      const header = await store.stat(TEST_HASH);
      expect(header.hash).toBe(TEST_HASH);
      expect(header.mimeType).toBe(TEST_METADATA.mimeType);
      expect(header.fileName).toBe(TEST_METADATA.fileName);
      expect(header.sizeBytes).toBe(TEST_METADATA.sizeBytes);
      expect(header.status).toBe("available");
    });

    it("returns header for evicted attachment", async () => {
      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));
      await store.evict(TEST_HASH);
      const header = await store.stat(TEST_HASH);
      expect(header.hash).toBe(TEST_HASH);
      expect(header.status).toBe("evicted");
    });

    it("does not update lastAccessedAtUtc", async () => {
      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));
      const before = await store.stat(TEST_HASH);

      // Small delay to ensure timestamps would differ if updated
      await new Promise((resolve) => setTimeout(resolve, 10));

      const after = await store.stat(TEST_HASH);
      expect(after.lastAccessedAtUtc).toBe(before.lastAccessedAtUtc);
    });

    it("throws AttachmentNotFound for unknown hash", async () => {
      await expect(store.stat("nonexistent")).rejects.toThrow(
        AttachmentNotFound,
      );
    });
  });

  describe("pending state via reservation", () => {
    const PENDING_CONTENT = "bytes-not-yet-uploaded";
    const PENDING_BYTES = new TextEncoder().encode(PENDING_CONTENT);
    const PENDING_HASH = computeHash(PENDING_BYTES);
    const PENDING_SIZE = PENDING_BYTES.byteLength;

    it("stat returns pending header when a live hash-bearing reservation exists and no attachment row", async () => {
      await reservationStore.create({
        mimeType: "application/pdf",
        fileName: "pending.pdf",
        extension: "pdf",
        clientHash: PENDING_HASH as AttachmentHash,
        sizeBytes: PENDING_SIZE,
      });

      const header = await store.stat(PENDING_HASH);

      expect(header.status).toBe("pending");
      expect(header.hash).toBe(PENDING_HASH);
      expect(header.mimeType).toBe("application/pdf");
      expect(header.fileName).toBe("pending.pdf");
      expect(header.sizeBytes).toBe(PENDING_SIZE);
      expect(typeof header.expiresAtUtc).toBe("string");
    });

    it("stat returns available header, not pending, when attachment row exists for the same hash", async () => {
      // Even if a pending reservation exists, an attachment row takes priority.
      await reservationStore.create({
        mimeType: "application/pdf",
        fileName: "pending.pdf",
        clientHash: PENDING_HASH as AttachmentHash,
        sizeBytes: PENDING_SIZE,
      });
      await store.put(
        PENDING_HASH,
        {
          mimeType: "application/pdf",
          fileName: "pending.pdf",
          sizeBytes: PENDING_SIZE,
          extension: null,
          createdAtUtc: new Date().toISOString(),
        },
        streamFromString(PENDING_CONTENT),
      );

      const header = await store.stat(PENDING_HASH);

      expect(header.status).toBe("available");
    });

    it("get throws AttachmentPending when a live hash-bearing reservation exists and no attachment row", async () => {
      await reservationStore.create({
        mimeType: "application/pdf",
        fileName: "pending.pdf",
        clientHash: PENDING_HASH as AttachmentHash,
        sizeBytes: PENDING_SIZE,
      });

      const err = await store.get(PENDING_HASH).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AttachmentPending);
      const typed = err as AttachmentPending;
      expect(typed.hash).toBe(PENDING_HASH);
      expect(typeof typed.expiresAtUtc).toBe("string");
    });

    it("get with pending reservation must NEVER return a zero-byte attachment (CRITICAL pin)", async () => {
      // Regression pin: a 202/pending response must never fall through to the
      // 'data' path and produce a zero-byte attachment. Verify that get() always
      // throws AttachmentPending, never resolves.
      await reservationStore.create({
        mimeType: "application/pdf",
        fileName: "pending.pdf",
        clientHash: PENDING_HASH as AttachmentHash,
        sizeBytes: PENDING_SIZE,
      });

      const result = await store
        .get(PENDING_HASH)
        .then(() => "resolved")
        .catch(() => "rejected");

      expect(result).toBe("rejected");
    });

    it("get throws AttachmentPending rather than calling transport for a pending hash", async () => {
      await reservationStore.create({
        mimeType: "text/plain",
        fileName: "f.txt",
        clientHash: PENDING_HASH as AttachmentHash,
        sizeBytes: PENDING_SIZE,
      });

      await expect(store.get(PENDING_HASH)).rejects.toBeInstanceOf(
        AttachmentPending,
      );
      // The transport must not have been consulted -- the pending reservation
      // is the authoritative answer.
      expect(transport.fetch).not.toHaveBeenCalled();
    });

    it("stat throws AttachmentNotFound when no attachment row and no pending reservation", async () => {
      await expect(store.stat(PENDING_HASH)).rejects.toBeInstanceOf(
        AttachmentNotFound,
      );
    });

    it("get throws AttachmentNotFound when no attachment row and no pending reservation and transport returns not-found", async () => {
      transport.fetch.mockResolvedValueOnce({ kind: "not-found" });

      await expect(store.get(PENDING_HASH)).rejects.toBeInstanceOf(
        AttachmentNotFound,
      );
    });
  });

  describe("evict", () => {
    it("sets status to evicted and deletes bytes from disk", async () => {
      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));
      await store.evict(TEST_HASH);

      const row = await db
        .selectFrom("attachment")
        .selectAll()
        .where("hash", "=", TEST_HASH)
        .executeTakeFirst();
      expect(row).toBeDefined();
      expect(row!.status).toBe("evicted");

      const filePath = storagePath(testStoragePath, TEST_HASH);
      expect(await attachmentBytesExist(filePath)).toBe(false);
    });

    it("is a no-op for unknown hash", async () => {
      await expect(store.evict("nonexistent")).resolves.toBeUndefined();
    });

    it("is a no-op for already-evicted hash", async () => {
      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));
      await store.evict(TEST_HASH);
      await expect(store.evict(TEST_HASH)).resolves.toBeUndefined();
    });

    it("skips eviction when active readers exist", async () => {
      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));

      const response = await store.get(TEST_HASH);
      // Stream is open — reader is active

      await store.evict(TEST_HASH);

      // Should still be available because the reader was active
      const row = await db
        .selectFrom("attachment")
        .selectAll()
        .where("hash", "=", TEST_HASH)
        .executeTakeFirst();
      expect(row!.status).toBe("available");

      const filePath = storagePath(testStoragePath, TEST_HASH);
      expect(await attachmentBytesExist(filePath)).toBe(true);

      // Consume the stream to release the reader
      await streamToBytes(response.body);

      // Now eviction should succeed
      await store.evict(TEST_HASH);
      const rowAfter = await db
        .selectFrom("attachment")
        .selectAll()
        .where("hash", "=", TEST_HASH)
        .executeTakeFirst();
      expect(rowAfter!.status).toBe("evicted");
    });

    it("releases active reader when consumer cancels the body stream", async () => {
      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));

      const response = await store.get(TEST_HASH);

      // Reader is active — eviction is blocked.
      await store.evict(TEST_HASH);
      const blockedRow = await db
        .selectFrom("attachment")
        .selectAll()
        .where("hash", "=", TEST_HASH)
        .executeTakeFirst();
      expect(blockedRow!.status).toBe("available");

      // Simulate client disconnect mid-download: cancel the wrapped stream.
      // wrapStreamWithCleanup.cancel() must run cleanup → release the reader.
      await response.body.cancel();

      // Reader count should now be 0; eviction succeeds.
      await store.evict(TEST_HASH);
      const evictedRow = await db
        .selectFrom("attachment")
        .selectAll()
        .where("hash", "=", TEST_HASH)
        .executeTakeFirst();
      expect(evictedRow!.status).toBe("evicted");
    });
  });

  describe("storageUsed", () => {
    it("returns 0 with no attachments", async () => {
      expect(await store.storageUsed()).toBe(0);
    });

    it("returns sum of sizeBytes for available attachments", async () => {
      const content2 = "second attachment";
      const bytes2 = new TextEncoder().encode(content2);
      const hash2 = computeHash(bytes2);
      const metadata2 = {
        mimeType: "text/plain",
        fileName: "second.txt",
        sizeBytes: bytes2.byteLength,
        extension: ".txt",
        createdAtUtc: "2020-01-15T12:34:56.000Z",
      };

      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));
      await store.put(hash2, metadata2, streamFromString(content2));

      expect(await store.storageUsed()).toBe(
        TEST_BYTES.byteLength + bytes2.byteLength,
      );
    });

    it("excludes evicted attachments", async () => {
      const content2 = "second attachment";
      const bytes2 = new TextEncoder().encode(content2);
      const hash2 = computeHash(bytes2);
      const metadata2 = {
        mimeType: "text/plain",
        fileName: "second.txt",
        sizeBytes: bytes2.byteLength,
        extension: ".txt",
        createdAtUtc: "2020-01-15T12:34:56.000Z",
      };

      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));
      await store.put(hash2, metadata2, streamFromString(content2));
      await store.evict(TEST_HASH);

      expect(await store.storageUsed()).toBe(bytes2.byteLength);
    });
  });
});
