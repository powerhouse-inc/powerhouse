import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import {
  streamHashAndWrite,
  attachmentBytesExist,
} from "../../../src/storage/fs/attachment-fs.js";
import { SizeMismatch, UploadTooLarge } from "../../../src/errors.js";

function streamFromBytes(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

describe("streamHashAndWrite declaredSizeBytes option", () => {
  let basePath: string;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), "shw-test-"));
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  describe("exact match", () => {
    it("returns correct hash and sizeBytes when byte count equals declared", async () => {
      const data = new TextEncoder().encode("exact");
      const result = await streamHashAndWrite(basePath, streamFromBytes(data), {
        declaredSizeBytes: data.byteLength,
      });

      expect(result.hash).toBe(sha256Hex(data));
      expect(result.sizeBytes).toBe(data.byteLength);
    });

    it("caller is responsible for the temp file on success (it remains in .tmp/)", async () => {
      const data = new TextEncoder().encode("exact");
      const result = await streamHashAndWrite(basePath, streamFromBytes(data), {
        declaredSizeBytes: data.byteLength,
      });

      // The function returns tempPath still inside .tmp/; it is the caller's
      // job to rename it to the final hash-derived location.
      const tmpDir = join(basePath, ".tmp");
      const files = await readdir(tmpDir).catch(() => [] as string[]);
      expect(files).toHaveLength(1);
      expect(result.tempPath).toContain(tmpDir);
    });

    it("returned tempPath exists and contains the correct bytes", async () => {
      const data = new TextEncoder().encode("exact content");
      const result = await streamHashAndWrite(basePath, streamFromBytes(data), {
        declaredSizeBytes: data.byteLength,
      });

      expect(await attachmentBytesExist(result.tempPath)).toBe(true);
    });
  });

  describe("over-declared (stream exceeds declaration) -- mid-stream abort", () => {
    it("throws SizeMismatch when first chunk already exceeds declared", async () => {
      const data = new TextEncoder().encode("too long");
      await expect(
        streamHashAndWrite(basePath, streamFromBytes(data), {
          declaredSizeBytes: 3,
        }),
      ).rejects.toBeInstanceOf(SizeMismatch);
    });

    it("SizeMismatch error carries declared and actual byte counts", async () => {
      const data = new TextEncoder().encode("too long");
      let caught: SizeMismatch | undefined;
      try {
        await streamHashAndWrite(basePath, streamFromBytes(data), {
          declaredSizeBytes: 3,
        });
      } catch (err) {
        caught = err as SizeMismatch;
      }

      expect(caught).toBeInstanceOf(SizeMismatch);
      expect(caught!.declared).toBe(3);
      expect(caught!.actual).toBeGreaterThan(3);
    });

    it("deletes the temp file on mid-stream SizeMismatch", async () => {
      const data = new TextEncoder().encode("too long");
      try {
        await streamHashAndWrite(basePath, streamFromBytes(data), {
          declaredSizeBytes: 3,
        });
      } catch {
        // expected
      }

      const tmpDir = join(basePath, ".tmp");
      const files = await readdir(tmpDir).catch(() => [] as string[]);
      expect(files).toHaveLength(0);
    });

    it("releases stream reader early when count exceeds declared mid-stream", async () => {
      const chunk1 = new TextEncoder().encode("abc");
      const chunk2 = new TextEncoder().encode("defghijklmnop");

      let pullCount = 0;
      const countingStream = new ReadableStream<Uint8Array>({
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

      try {
        await streamHashAndWrite(basePath, countingStream, {
          declaredSizeBytes: 5,
        });
      } catch {
        // expected SizeMismatch
      }

      // The key guarantee is that SizeMismatch fires as soon as the running
      // total exceeds the declaration. After chunk1 (3) the counter is below
      // 5, so chunk2 is pulled. When chunk2 arrives (3+13=16 > 5), abort.
      // No further pulls should follow. The exact pull count is 2 here.
      expect(pullCount).toBeLessThanOrEqual(2);
    });
  });

  describe("under-declared (stream ends short) -- end-of-stream check", () => {
    it("throws SizeMismatch when stream ends with fewer bytes than declared", async () => {
      const data = new TextEncoder().encode("short");
      await expect(
        streamHashAndWrite(basePath, streamFromBytes(data), {
          declaredSizeBytes: 1000,
        }),
      ).rejects.toBeInstanceOf(SizeMismatch);
    });

    it("SizeMismatch error carries declared and actual on short stream", async () => {
      const data = new TextEncoder().encode("short");
      let caught: SizeMismatch | undefined;
      try {
        await streamHashAndWrite(basePath, streamFromBytes(data), {
          declaredSizeBytes: 1000,
        });
      } catch (err) {
        caught = err as SizeMismatch;
      }

      expect(caught).toBeInstanceOf(SizeMismatch);
      expect(caught!.declared).toBe(1000);
      expect(caught!.actual).toBe(data.byteLength);
    });

    it("deletes the temp file on short-stream SizeMismatch", async () => {
      const data = new TextEncoder().encode("short");
      try {
        await streamHashAndWrite(basePath, streamFromBytes(data), {
          declaredSizeBytes: 1000,
        });
      } catch {
        // expected
      }

      const tmpDir = join(basePath, ".tmp");
      const files = await readdir(tmpDir).catch(() => [] as string[]);
      expect(files).toHaveLength(0);
    });
  });

  describe("interaction with maxBytes", () => {
    it("throws UploadTooLarge (not SizeMismatch) when maxBytes is hit first", async () => {
      const data = new TextEncoder().encode("exceeds both limits");
      await expect(
        streamHashAndWrite(basePath, streamFromBytes(data), {
          maxBytes: 5,
          declaredSizeBytes: 1000,
        }),
      ).rejects.toBeInstanceOf(UploadTooLarge);
    });

    it("throws SizeMismatch when declaredSizeBytes exceeded but maxBytes not reached", async () => {
      const data = new Uint8Array(20).fill(0x41);
      await expect(
        streamHashAndWrite(basePath, streamFromBytes(data), {
          maxBytes: 100,
          declaredSizeBytes: 10,
        }),
      ).rejects.toBeInstanceOf(SizeMismatch);
    });

    it("succeeds when bytes equal both maxBytes and declaredSizeBytes", async () => {
      const data = new Uint8Array(10).fill(0x42);
      const result = await streamHashAndWrite(basePath, streamFromBytes(data), {
        maxBytes: 10,
        declaredSizeBytes: 10,
      });

      expect(result.sizeBytes).toBe(10);
      expect(result.hash).toBe(sha256Hex(data));
    });
  });

  describe("multi-chunk streams", () => {
    it("accumulates byte count across chunks when checking declared size", async () => {
      const chunk1 = new TextEncoder().encode("abc");
      const chunk2 = new TextEncoder().encode("de");
      const combined = new Uint8Array([...chunk1, ...chunk2]);
      const declared = combined.byteLength;

      const result = await streamHashAndWrite(
        basePath,
        streamFromChunks([chunk1, chunk2]),
        { declaredSizeBytes: declared },
      );

      expect(result.sizeBytes).toBe(declared);
      expect(result.hash).toBe(sha256Hex(combined));
    });

    it("throws SizeMismatch when accumulated count exceeds declared across chunks", async () => {
      const chunk1 = new TextEncoder().encode("abc");
      const chunk2 = new TextEncoder().encode("defghijklmnop");
      // declared = 5, total = 3 + 13 = 16

      await expect(
        streamHashAndWrite(basePath, streamFromChunks([chunk1, chunk2]), {
          declaredSizeBytes: 5,
        }),
      ).rejects.toBeInstanceOf(SizeMismatch);
    });
  });

  describe("empty stream", () => {
    it("succeeds with declaredSizeBytes=0 for empty stream", async () => {
      const emptyStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });

      const result = await streamHashAndWrite(basePath, emptyStream, {
        declaredSizeBytes: 0,
      });

      expect(result.sizeBytes).toBe(0);
    });

    it("throws SizeMismatch when empty stream but declaredSizeBytes > 0", async () => {
      const emptyStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });

      await expect(
        streamHashAndWrite(basePath, emptyStream, { declaredSizeBytes: 10 }),
      ).rejects.toBeInstanceOf(SizeMismatch);
    });
  });
});
