import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  HashMismatch,
  SizeMismatch,
  ReservationNotFound,
} from "../../src/errors.js";
import {
  storagePath,
  attachmentBytesExist,
} from "../../src/storage/fs/attachment-fs.js";
import { createRef } from "../../src/ref.js";
import { DirectAttachmentUpload } from "../../src/direct/direct-attachment-upload.js";
import {
  createTestDirectUpload,
  streamFromString,
  computeHash,
} from "../factories.js";
import type { KyselyReservationStore } from "../../src/storage/kysely/reservation-store.js";
import type { KyselyAttachmentStore } from "../../src/storage/kysely/attachment-store.js";
import type { Kysely } from "kysely";
import type { AttachmentDatabase } from "../../src/storage/kysely/types.js";
import type { AttachmentHash } from "@powerhousedao/reactor";

const CORRECT_CONTENT = "hello hash-first world";
const CORRECT_BYTES = new TextEncoder().encode(CORRECT_CONTENT);
const CORRECT_HASH = computeHash(CORRECT_BYTES) as AttachmentHash;

// Same byte length as CORRECT_CONTENT so size check passes and hash check fires.
const WRONG_CONTENT = "WRONG hash-first world";
const WRONG_BYTES = new TextEncoder().encode(WRONG_CONTENT);
const WRONG_HASH = computeHash(WRONG_BYTES) as AttachmentHash;

async function createHashFirstUpload(
  clientHash: AttachmentHash,
  sizeBytes: number,
): Promise<{
  upload: DirectAttachmentUpload;
  reservationId: string;
  db: Kysely<AttachmentDatabase>;
  testStoragePath: string;
  reservationStore: KyselyReservationStore;
  store: KyselyAttachmentStore;
  cleanup: () => Promise<void>;
}> {
  const setup = await createTestDirectUpload({
    mimeType: "text/plain",
    fileName: "test",
    extension: "txt",
    clientHash,
    sizeBytes,
  });

  return {
    upload: setup.upload,
    reservationId: setup.reservationId,
    db: setup.db,
    testStoragePath: setup.storagePath,
    reservationStore: setup.reservationStore,
    store: setup.store,
    cleanup: setup.cleanup,
  };
}

describe("DirectAttachmentUpload hash-first ingest verification", () => {
  describe("HashMismatch", () => {
    it("throws HashMismatch when uploaded bytes do not match the claimed hash", async () => {
      const { upload, cleanup } = await createHashFirstUpload(
        CORRECT_HASH,
        CORRECT_BYTES.byteLength,
      );
      try {
        await expect(
          upload.send(streamFromString(WRONG_CONTENT)),
        ).rejects.toBeInstanceOf(HashMismatch);
      } finally {
        await cleanup();
      }
    });

    it("HashMismatch carries claimed and actual hashes", async () => {
      const { upload, cleanup } = await createHashFirstUpload(
        CORRECT_HASH,
        WRONG_BYTES.byteLength,
      );
      try {
        let caught: HashMismatch | undefined;
        try {
          await upload.send(streamFromString(WRONG_CONTENT));
        } catch (err) {
          caught = err as HashMismatch;
        }
        expect(caught).toBeInstanceOf(HashMismatch);
        expect(caught!.claimed).toBe(CORRECT_HASH);
        expect(caught!.actual).toBe(WRONG_HASH);
      } finally {
        await cleanup();
      }
    });

    it("deletes the temp file on HashMismatch", async () => {
      const { upload, testStoragePath, cleanup } = await createHashFirstUpload(
        CORRECT_HASH,
        WRONG_BYTES.byteLength,
      );
      try {
        try {
          await upload.send(streamFromString(WRONG_CONTENT));
        } catch {
          // expected
        }

        const tmpDir = join(testStoragePath, ".tmp");
        const leftovers = await readdir(tmpDir).catch(() => [] as string[]);
        expect(leftovers).toEqual([]);
      } finally {
        await cleanup();
      }
    });

    it("does not commit attachment row on HashMismatch", async () => {
      const { upload, db, cleanup } = await createHashFirstUpload(
        CORRECT_HASH,
        WRONG_BYTES.byteLength,
      );
      try {
        try {
          await upload.send(streamFromString(WRONG_CONTENT));
        } catch {
          // expected
        }

        const rows = await db.selectFrom("attachment").selectAll().execute();
        expect(rows).toHaveLength(0);
      } finally {
        await cleanup();
      }
    });

    it("does not commit under the actual hash on HashMismatch", async () => {
      const { upload, db, cleanup } = await createHashFirstUpload(
        CORRECT_HASH,
        WRONG_BYTES.byteLength,
      );
      try {
        try {
          await upload.send(streamFromString(WRONG_CONTENT));
        } catch {
          // expected
        }

        const row = await db
          .selectFrom("attachment")
          .selectAll()
          .where("hash", "=", WRONG_HASH)
          .executeTakeFirst();
        expect(row).toBeUndefined();
      } finally {
        await cleanup();
      }
    });

    it("retains the reservation on HashMismatch so the client can retry", async () => {
      const { upload, reservationId, reservationStore, cleanup } =
        await createHashFirstUpload(CORRECT_HASH, WRONG_BYTES.byteLength);
      try {
        try {
          await upload.send(streamFromString(WRONG_CONTENT));
        } catch {
          // expected
        }

        const reservation = await reservationStore.get(reservationId);
        expect(reservation.reservationId).toBe(reservationId);
      } finally {
        await cleanup();
      }
    });

    it("does not write bytes to the final hash path on HashMismatch", async () => {
      const { upload, testStoragePath, cleanup } = await createHashFirstUpload(
        CORRECT_HASH,
        WRONG_BYTES.byteLength,
      );
      try {
        try {
          await upload.send(streamFromString(WRONG_CONTENT));
        } catch {
          // expected
        }

        const claimedPath = storagePath(testStoragePath, CORRECT_HASH);
        expect(await attachmentBytesExist(claimedPath)).toBe(false);

        const actualPath = storagePath(testStoragePath, WRONG_HASH);
        expect(await attachmentBytesExist(actualPath)).toBe(false);
      } finally {
        await cleanup();
      }
    });
  });

  describe("SizeMismatch -- mid-stream (over-declared)", () => {
    it("throws SizeMismatch when uploaded bytes exceed declared sizeBytes", async () => {
      const smallDeclared = 3;
      const { upload, cleanup } = await createHashFirstUpload(
        CORRECT_HASH,
        smallDeclared,
      );
      try {
        await expect(
          upload.send(streamFromString(CORRECT_CONTENT)),
        ).rejects.toBeInstanceOf(SizeMismatch);
      } finally {
        await cleanup();
      }
    });

    it("SizeMismatch carries declared and actual counts", async () => {
      const declared = 3;
      const { upload, cleanup } = await createHashFirstUpload(
        CORRECT_HASH,
        declared,
      );
      try {
        let caught: SizeMismatch | undefined;
        try {
          await upload.send(streamFromString(CORRECT_CONTENT));
        } catch (err) {
          caught = err as SizeMismatch;
        }
        expect(caught).toBeInstanceOf(SizeMismatch);
        expect(caught!.declared).toBe(declared);
        expect(caught!.actual).toBeGreaterThan(declared);
      } finally {
        await cleanup();
      }
    });

    it("does not consume the full source stream when count exceeds declaration mid-stream", async () => {
      // declared = 5, chunk1 = 3 bytes (fits), chunk2 = 100 bytes (tips over).
      // After chunk2 arrives the reader should be released without pulling more.
      const chunk1 = new Uint8Array(3).fill(0x41);
      const chunk2 = new Uint8Array(100).fill(0x42);
      let pullCount = 0;

      const trackedStream = new ReadableStream<Uint8Array>({
        pull(controller) {
          pullCount++;
          if (pullCount === 1) {
            controller.enqueue(chunk1);
          } else if (pullCount === 2) {
            controller.enqueue(chunk2);
            controller.close();
          } else {
            controller.close();
          }
        },
      });

      const { upload, db, cleanup } = await createHashFirstUpload(
        CORRECT_HASH,
        5,
      );
      try {
        try {
          await upload.send(trackedStream);
        } catch {
          // expected SizeMismatch
        }

        // No attachment row should have been committed.
        const rows = await db.selectFrom("attachment").selectAll().execute();
        expect(rows).toHaveLength(0);

        // The reader must have been released (pullCount <= 2) -- no extra reads
        // after the abort, which would indicate the stream was fully consumed.
        expect(pullCount).toBeLessThanOrEqual(2);
      } finally {
        await cleanup();
      }
    });

    it("does not commit attachment row on SizeMismatch", async () => {
      const { upload, db, cleanup } = await createHashFirstUpload(
        CORRECT_HASH,
        3,
      );
      try {
        try {
          await upload.send(streamFromString(CORRECT_CONTENT));
        } catch {
          // expected
        }

        const rows = await db.selectFrom("attachment").selectAll().execute();
        expect(rows).toHaveLength(0);
      } finally {
        await cleanup();
      }
    });

    it("retains the reservation on SizeMismatch so the client can retry", async () => {
      const { upload, reservationId, reservationStore, cleanup } =
        await createHashFirstUpload(CORRECT_HASH, 3);
      try {
        try {
          await upload.send(streamFromString(CORRECT_CONTENT));
        } catch {
          // expected
        }

        const reservation = await reservationStore.get(reservationId);
        expect(reservation.reservationId).toBe(reservationId);
      } finally {
        await cleanup();
      }
    });

    it("deletes the temp file on SizeMismatch", async () => {
      const { upload, testStoragePath, cleanup } = await createHashFirstUpload(
        CORRECT_HASH,
        3,
      );
      try {
        try {
          await upload.send(streamFromString(CORRECT_CONTENT));
        } catch {
          // expected
        }

        const tmpDir = join(testStoragePath, ".tmp");
        const leftovers = await readdir(tmpDir).catch(() => [] as string[]);
        expect(leftovers).toEqual([]);
      } finally {
        await cleanup();
      }
    });
  });

  describe("SizeMismatch -- at stream end (short)", () => {
    it("throws SizeMismatch when stream ends short of declared sizeBytes", async () => {
      const shortContent = "hi";
      const shortBytes = new TextEncoder().encode(shortContent);
      const declared = 1000;
      const { upload, cleanup } = await createHashFirstUpload(
        computeHash(shortBytes) as AttachmentHash,
        declared,
      );
      try {
        await expect(
          upload.send(streamFromString(shortContent)),
        ).rejects.toBeInstanceOf(SizeMismatch);
      } finally {
        await cleanup();
      }
    });

    it("SizeMismatch at end carries declared and actual byte counts", async () => {
      const shortContent = "hi";
      const shortBytes = new TextEncoder().encode(shortContent);
      const declared = 1000;
      const { upload, cleanup } = await createHashFirstUpload(
        computeHash(shortBytes) as AttachmentHash,
        declared,
      );
      try {
        let caught: SizeMismatch | undefined;
        try {
          await upload.send(streamFromString(shortContent));
        } catch (err) {
          caught = err as SizeMismatch;
        }
        expect(caught).toBeInstanceOf(SizeMismatch);
        expect(caught!.declared).toBe(declared);
        expect(caught!.actual).toBe(shortBytes.byteLength);
      } finally {
        await cleanup();
      }
    });

    it("does not commit on short stream", async () => {
      const shortContent = "hi";
      const shortBytes = new TextEncoder().encode(shortContent);
      const { upload, db, cleanup } = await createHashFirstUpload(
        computeHash(shortBytes) as AttachmentHash,
        1000,
      );
      try {
        try {
          await upload.send(streamFromString(shortContent));
        } catch {
          // expected
        }

        const rows = await db.selectFrom("attachment").selectAll().execute();
        expect(rows).toHaveLength(0);
      } finally {
        await cleanup();
      }
    });
  });

  describe("matching hash+size commits normally", () => {
    let upload: DirectAttachmentUpload;
    let reservationId: string;
    let db: Kysely<AttachmentDatabase>;
    let testStoragePath: string;
    let reservationStore: KyselyReservationStore;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const setup = await createHashFirstUpload(
        CORRECT_HASH,
        CORRECT_BYTES.byteLength,
      );
      upload = setup.upload;
      reservationId = setup.reservationId;
      db = setup.db;
      testStoragePath = setup.testStoragePath;
      reservationStore = setup.reservationStore;
      cleanup = setup.cleanup;
    });

    afterEach(async () => {
      await cleanup();
    });

    it("returns AttachmentUploadResult with the correct hash and ref", async () => {
      const result = await upload.send(streamFromString(CORRECT_CONTENT));

      expect(result.hash).toBe(CORRECT_HASH);
      expect(result.ref).toBe(createRef(CORRECT_HASH));
    });

    it("writes bytes to disk at the hash-derived path", async () => {
      await upload.send(streamFromString(CORRECT_CONTENT));

      const path = storagePath(testStoragePath, CORRECT_HASH);
      expect(await attachmentBytesExist(path)).toBe(true);
    });

    it("creates attachment row with status=available", async () => {
      await upload.send(streamFromString(CORRECT_CONTENT));

      const row = await db
        .selectFrom("attachment")
        .selectAll()
        .where("hash", "=", CORRECT_HASH)
        .executeTakeFirst();

      expect(row).toBeDefined();
      expect(row!.status).toBe("available");
      expect(row!.source).toBe("local");
    });

    it("soft-deletes the reservation after successful upload", async () => {
      await upload.send(streamFromString(CORRECT_CONTENT));

      await expect(reservationStore.get(reservationId)).rejects.toThrow(
        ReservationNotFound,
      );
    });

    it("result header sizeBytes matches the actual uploaded byte count", async () => {
      const result = await upload.send(streamFromString(CORRECT_CONTENT));

      expect(result.header.sizeBytes).toBe(CORRECT_BYTES.byteLength);
    });
  });

  describe("ref field on handle", () => {
    it("handle.ref is set immediately to attachment://v1:<clientHash>", async () => {
      const { upload, cleanup } = await createHashFirstUpload(
        CORRECT_HASH,
        CORRECT_BYTES.byteLength,
      );
      try {
        expect(upload.ref).toBe(createRef(CORRECT_HASH));
      } finally {
        await cleanup();
      }
    });

    it("handle.ref is null in legacy mode (no clientHash)", async () => {
      const setup = await createTestDirectUpload({
        mimeType: "text/plain",
        fileName: "test",
        extension: "txt",
      });
      try {
        expect(setup.upload.ref).toBeNull();
      } finally {
        await setup.cleanup();
      }
    });
  });

  describe("UploadTooLarge still works alongside hash-first", () => {
    it("throws UploadTooLarge before HashMismatch when maxBytes is exceeded", async () => {
      const {
        db,
        reservationStore,
        store: _store,
        cleanup,
      } = await createHashFirstUpload(CORRECT_HASH, CORRECT_BYTES.byteLength);
      const { mkdtemp, rm } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join: pjoin } = await import("node:path");

      const storagePath2 = await mkdtemp(pjoin(tmpdir(), "maxbytes-test-"));
      const reservation2 = await reservationStore.create({
        mimeType: "text/plain",
        fileName: "test",
        extension: "txt",
        clientHash: CORRECT_HASH,
        sizeBytes: CORRECT_BYTES.byteLength,
      });

      const { UploadTooLarge } = await import("../../src/errors.js");
      const cappedUpload = new DirectAttachmentUpload(
        reservation2.reservationId,
        {
          mimeType: "text/plain",
          fileName: "test",
          extension: "txt",
          clientHash: CORRECT_HASH,
          sizeBytes: CORRECT_BYTES.byteLength,
        },
        db,
        storagePath2,
        reservationStore,
        2,
      );

      try {
        await expect(
          cappedUpload.send(streamFromString(CORRECT_CONTENT)),
        ).rejects.toBeInstanceOf(UploadTooLarge);
      } finally {
        await cleanup();
        await rm(storagePath2, { recursive: true, force: true });
      }
    });
  });
});
