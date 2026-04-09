import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Kysely } from "kysely";
import type { KyselyReservationStore } from "../../src/storage/kysely/reservation-store.js";
import type { KyselyAttachmentStore } from "../../src/storage/kysely/attachment-store.js";
import type { AttachmentDatabase } from "../../src/storage/kysely/types.js";
import { ReservationNotFound } from "../../src/errors.js";
import {
  storagePath,
  attachmentBytesExist,
} from "../../src/storage/fs/attachment-fs.js";
import { createRef } from "../../src/ref.js";
import { DirectAttachmentUpload } from "../../src/direct/direct-attachment-upload.js";
import {
  createTestDirectUpload,
  streamFromString,
  streamToBytes,
  computeHash,
} from "../factories.js";

const TEST_CONTENT = "hello upload world";
const TEST_BYTES = new TextEncoder().encode(TEST_CONTENT);
const TEST_HASH = computeHash(TEST_BYTES);

describe("DirectAttachmentUpload", () => {
  let upload: DirectAttachmentUpload;
  let reservationId: string;
  let db: Kysely<AttachmentDatabase>;
  let testStoragePath: string;
  let reservationStore: KyselyReservationStore;
  let store: KyselyAttachmentStore;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestDirectUpload();
    upload = setup.upload;
    reservationId = setup.reservationId;
    db = setup.db;
    testStoragePath = setup.storagePath;
    reservationStore = setup.reservationStore;
    store = setup.store;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("send", () => {
    it("computes correct SHA-256 hash", async () => {
      const result = await upload.send(streamFromString(TEST_CONTENT));
      expect(result.hash).toBe(TEST_HASH);
    });

    it("writes bytes to correct fan-out path", async () => {
      await upload.send(streamFromString(TEST_CONTENT));
      const path = storagePath(testStoragePath, TEST_HASH);
      expect(await attachmentBytesExist(path)).toBe(true);
    });

    it("creates attachment record with source='local'", async () => {
      await upload.send(streamFromString(TEST_CONTENT));

      const row = await db
        .selectFrom("attachment")
        .selectAll()
        .where("hash", "=", TEST_HASH)
        .executeTakeFirst();

      expect(row).toBeDefined();
      expect(row!.source).toBe("local");
      expect(row!.status).toBe("available");
    });

    it("records correct metadata", async () => {
      await upload.send(streamFromString(TEST_CONTENT));

      const row = await db
        .selectFrom("attachment")
        .selectAll()
        .where("hash", "=", TEST_HASH)
        .executeTakeFirst();

      expect(row!.mime_type).toBe("text/plain");
      expect(row!.file_name).toBe("test");
      expect(row!.extension).toBe("txt");
      expect(Number(row!.size_bytes)).toBe(TEST_BYTES.byteLength);
    });

    it("deletes the reservation", async () => {
      await upload.send(streamFromString(TEST_CONTENT));

      await expect(reservationStore.get(reservationId)).rejects.toThrow(
        ReservationNotFound,
      );
    });

    it("returns correct AttachmentUploadResult", async () => {
      const result = await upload.send(streamFromString(TEST_CONTENT));

      expect(result.hash).toBe(TEST_HASH);
      expect(result.ref).toBe(createRef(TEST_HASH));
      expect(result.header.hash).toBe(TEST_HASH);
      expect(result.header.mimeType).toBe("text/plain");
      expect(result.header.fileName).toBe("test");
      expect(result.header.sizeBytes).toBe(TEST_BYTES.byteLength);
      expect(result.header.status).toBe("available");
      expect(result.header.source).toBe("local");
    });

    it("dedup: same content returns same ref", async () => {
      const result1 = await upload.send(streamFromString(TEST_CONTENT));

      // Create a second upload handle for the same content
      const reservation2 = await reservationStore.create({
        mimeType: "text/plain",
        fileName: "test",
        extension: "txt",
      });
      const upload2 = new DirectAttachmentUpload(
        reservation2.reservationId,
        { mimeType: "text/plain", fileName: "test", extension: "txt" },
        db,
        testStoragePath,
        reservationStore,
      );

      const result2 = await upload2.send(streamFromString(TEST_CONTENT));

      expect(result2.hash).toBe(result1.hash);
      expect(result2.ref).toBe(result1.ref);

      // Only one row in the DB
      const rows = await db
        .selectFrom("attachment")
        .selectAll()
        .where("hash", "=", TEST_HASH)
        .execute();
      expect(rows).toHaveLength(1);
    });

    it("restores evicted attachment", async () => {
      // Put via store (source='sync'), then evict
      await store.put(
        TEST_HASH,
        {
          mimeType: "text/plain",
          fileName: "test",
          sizeBytes: TEST_BYTES.byteLength,
          extension: "txt",
        },
        streamFromString(TEST_CONTENT),
      );
      await store.evict(TEST_HASH);

      const result = await upload.send(streamFromString(TEST_CONTENT));

      expect(result.header.status).toBe("available");
      expect(result.header.source).toBe("local");

      // Verify bytes are back on disk
      const path = storagePath(testStoragePath, TEST_HASH);
      expect(await attachmentBytesExist(path)).toBe(true);
    });

    it("handles multi-chunk stream", async () => {
      const chunk1 = new TextEncoder().encode("hello ");
      const chunk2 = new TextEncoder().encode("world");
      const combined = new Uint8Array([...chunk1, ...chunk2]);
      const expectedHash = computeHash(combined);

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk1);
          controller.enqueue(chunk2);
          controller.close();
        },
      });

      const result = await upload.send(stream);
      expect(result.hash).toBe(expectedHash);

      // Verify stored bytes match
      const response = await store.get(expectedHash);
      const storedBytes = await streamToBytes(response.body);
      expect(storedBytes).toEqual(combined);
    });
  });
});
