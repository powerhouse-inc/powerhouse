import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { Kysely } from "kysely";
import type { KyselyReservationStore } from "../../src/storage/kysely/reservation-store.js";
import type { KyselyAttachmentStore } from "../../src/storage/kysely/attachment-store.js";
import type { AttachmentDatabase } from "../../src/storage/kysely/types.js";
import { ReservationNotFound, UploadTooLarge } from "../../src/errors.js";
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
          createdAtUtc: "2020-01-15T12:34:56.000Z",
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

    it("leaves the reservation when the stream aborts, sweep cleans it up", async () => {
      const failingStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("partial"));
        },
        pull(controller) {
          controller.error(new Error("client disconnected"));
        },
      });

      await expect(upload.send(failingStream)).rejects.toThrow(
        "client disconnected",
      );

      const before = await reservationStore.get(reservationId);
      expect(before.reservationId).toBe(reservationId);

      // Backdate to simulate TTL elapsing.
      await db
        .updateTable("attachment_reservation")
        .set({ expires_at_utc: new Date(0).toISOString() })
        .where("reservation_id", "=", reservationId)
        .execute();

      const deleted = await reservationStore.deleteExpired();
      expect(deleted).toBe(1);

      await expect(reservationStore.get(reservationId)).rejects.toThrow(
        ReservationNotFound,
      );
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

    it("hashes correctly across many small chunks", async () => {
      // 1024 chunks of 17 bytes -- a deliberately awkward shape to catch any
      // off-by-one in the streaming hash/write path.
      const chunkCount = 1024;
      const chunkSize = 17;
      const reference = new Uint8Array(chunkCount * chunkSize);
      for (let i = 0; i < reference.length; i++) reference[i] = i & 0xff;
      const expectedHash = computeHash(reference);

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < chunkCount; i++) {
            controller.enqueue(
              reference.slice(i * chunkSize, (i + 1) * chunkSize),
            );
          }
          controller.close();
        },
      });

      const result = await upload.send(stream);
      expect(result.hash).toBe(expectedHash);
      expect(result.header.sizeBytes).toBe(reference.byteLength);

      const response = await store.get(expectedHash);
      const storedBytes = await streamToBytes(response.body);
      expect(storedBytes.byteLength).toBe(reference.byteLength);
      // Recompute the hash from disk -- byte-for-byte identity check
      expect(createHash("sha256").update(storedBytes).digest("hex")).toBe(
        expectedHash,
      );
    });

    it("memory stays bounded for large uploads", async () => {
      // Stream ~64 MiB through the upload in 1 MiB chunks. With the old
      // collectAndHash, heap growth would track payload size; with the
      // streaming write+hash, heap growth should be a small multiple of one
      // chunk. We use a generous threshold (payload / 8) to avoid V8 GC
      // noise while still catching a regression to full-buffer behavior.
      const chunkSize = 1 << 20; // 1 MiB
      const chunkCount = 64; // 64 MiB total
      const payloadSize = chunkSize * chunkCount;
      const fillByte = 0x5a;

      // Pre-baseline -- give V8 a chance to settle.
      global.gc?.();
      const baseline = process.memoryUsage().heapUsed;

      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          // Allocate per-pull so each chunk is collectible after consumption.
          if (
            (stream as unknown as { _emitted?: number })._emitted === undefined
          ) {
            (stream as unknown as { _emitted?: number })._emitted = 0;
          }
          const state = stream as unknown as { _emitted: number };
          if (state._emitted >= chunkCount) {
            controller.close();
            return;
          }
          const chunk = new Uint8Array(chunkSize);
          chunk.fill(fillByte);
          state._emitted++;
          controller.enqueue(chunk);
        },
      });

      const result = await upload.send(stream);

      global.gc?.();
      const peak = process.memoryUsage().heapUsed;
      const heapGrowth = peak - baseline;

      expect(result.header.sizeBytes).toBe(payloadSize);
      // Threshold: heap should not grow proportionally to payload.
      // payload/8 = 8 MiB ceiling for 64 MiB payload.
      expect(heapGrowth).toBeLessThan(payloadSize / 8);
    }, 60_000);

    describe("with maxBytes cap", () => {
      it("rejects oversize upload with UploadTooLarge and stores nothing", async () => {
        const setup = await createTestDirectUpload();
        try {
          const cappedUpload = new DirectAttachmentUpload(
            setup.reservationId,
            { mimeType: "text/plain", fileName: "test", extension: "txt" },
            setup.db,
            setup.storagePath,
            setup.reservationStore,
            1024,
          );

          const oversize = new Uint8Array(2048);
          oversize.fill(0x41);
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(oversize);
              controller.close();
            },
          });

          await expect(cappedUpload.send(stream)).rejects.toBeInstanceOf(
            UploadTooLarge,
          );

          // No DB row created
          const rows = await setup.db
            .selectFrom("attachment")
            .selectAll()
            .execute();
          expect(rows).toHaveLength(0);

          // Reservation still present (caller may retry with smaller payload)
          await expect(
            setup.reservationStore.get(setup.reservationId),
          ).resolves.toBeDefined();

          // No leftover temp file
          const tmpDir = join(setup.storagePath, ".tmp");
          const leftovers = await readdir(tmpDir).catch(() => [] as string[]);
          expect(leftovers).toEqual([]);
        } finally {
          await setup.cleanup();
        }
      });

      it("allows uploads at or below the cap", async () => {
        const setup = await createTestDirectUpload();
        try {
          const cappedUpload = new DirectAttachmentUpload(
            setup.reservationId,
            { mimeType: "text/plain", fileName: "test", extension: "txt" },
            setup.db,
            setup.storagePath,
            setup.reservationStore,
            1024,
          );

          const exact = new Uint8Array(1024);
          exact.fill(0x42);
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(exact);
              controller.close();
            },
          });

          const result = await cappedUpload.send(stream);
          expect(result.header.sizeBytes).toBe(1024);
        } finally {
          await setup.cleanup();
        }
      });
    });
  });
});
