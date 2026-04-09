import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { KyselyAttachmentStore } from "../../../src/storage/kysely/attachment-store.js";
import { AttachmentNotFound } from "../../../src/errors.js";
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
const TEST_METADATA = {
  mimeType: "text/plain",
  fileName: "test.txt",
  sizeBytes: TEST_BYTES.byteLength,
  extension: ".txt",
};

describe("KyselyAttachmentStore", () => {
  let store: KyselyAttachmentStore;
  let db: Kysely<AttachmentDatabase>;
  let transport: MockTransport;
  let testStoragePath: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestAttachmentStore();
    store = setup.store;
    db = setup.db;
    transport = setup.transport;
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
        hash: TEST_HASH,
        metadata: TEST_METADATA,
        body: streamFromString(TEST_CONTENT),
      });

      const response = await store.get(TEST_HASH);
      const bytes = await streamToBytes(response.body);
      expect(new TextDecoder().decode(bytes)).toBe(TEST_CONTENT);
      expect(transport.fetch).toHaveBeenCalledWith(TEST_HASH, undefined);
    });

    it("throws AttachmentNotFound when evicted and transport returns null", async () => {
      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));
      await store.evict(TEST_HASH);

      transport.fetch.mockResolvedValueOnce(null);

      await expect(store.get(TEST_HASH)).rejects.toThrow(AttachmentNotFound);
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
      };

      await store.put(TEST_HASH, TEST_METADATA, streamFromString(TEST_CONTENT));
      await store.put(hash2, metadata2, streamFromString(content2));
      await store.evict(TEST_HASH);

      expect(await store.storageUsed()).toBe(bytes2.byteLength);
    });
  });
});
