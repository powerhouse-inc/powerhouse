import { mkdtemp, rm, readdir } from "node:fs/promises";
import type * as NodeFs from "node:fs";
import {
  appendFileSync,
  createWriteStream,
  writeFileSync,
  type WriteStream,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { Writable } from "node:stream";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  storagePath,
  storageRelativePath,
  writeAttachmentBytes,
  readAttachmentStream,
  deleteAttachmentBytes,
  attachmentBytesExist,
} from "../../../src/storage/fs/attachment-fs.js";
import { streamFromString, streamToBytes } from "../../factories.js";

// The source imports `createWriteStream` as a named ESM binding, which
// `vi.spyOn` on the namespace cannot intercept. Mock the module and default
// the spy to the real implementation, so only the tests that opt in with
// `mockImplementationOnce` get a failing destination stream.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  return { ...actual, createWriteStream: vi.fn(actual.createWriteStream) };
});

const mockedCreateWriteStream = vi.mocked(createWriteStream);

/** Byte-wise equality for two buffers. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Yield `content` in `chunkSize`-byte chunks so a write is spread across many
 * small I/O operations -- a wide window in which a non-atomic writer would
 * leave the destination partially written.
 */
function chunkedStream(
  content: string,
  chunkSize: number,
): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(content);
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + chunkSize, bytes.length);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  });
}

/**
 * A destination stream standing in for a `createWriteStream` whose writes
 * fail at flush time -- ENOSPC on a full disk. The temp file is created and
 * left partial, which is exactly what must never reach the destination, and
 * the failure is reported asynchronously from `_write`, after `write()` has
 * already returned true. Nothing here exerts backpressure, so the read loop
 * never waits for a drain.
 */
function flushFailureWriteStream(targetPath: string): Writable {
  writeFileSync(targetPath, "");
  let wrotePartial = false;
  return new Writable({
    highWaterMark: 64 * 1024,
    write(chunk: Buffer, _encoding, callback) {
      if (!wrotePartial) {
        wrotePartial = true;
        appendFileSync(targetPath, chunk.subarray(0, 8));
      }
      setImmediate(() => {
        callback(new Error("ENOSPC: no space left on device, write"));
      });
    },
  });
}

/**
 * A destination stream standing in for a `createWriteStream` that fails to
 * open its temp file: the error lands before the write is ended, and no temp
 * file is ever created.
 */
function openFailureWriteStream(): Writable {
  const stream = new Writable({
    highWaterMark: 64 * 1024,
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  setImmediate(() => {
    stream.destroy(new Error("EACCES: permission denied, open"));
  });
  return stream;
}

describe("attachment-fs", () => {
  let basePath: string;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), "attachment-fs-test-"));
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  describe("storagePath", () => {
    it("generates correct 2-level fan-out path", () => {
      const hash = "abcdef1234567890";
      const result = storagePath("/data", hash);
      expect(result).toBe(join("/data", "ab", "cd", hash));
    });
  });

  describe("storageRelativePath", () => {
    it("returns relative portion without base", () => {
      const hash = "abcdef1234567890";
      const result = storageRelativePath(hash);
      expect(result).toBe(join("ab", "cd", hash));
    });
  });

  describe("writeAttachmentBytes", () => {
    it("creates parent directories and writes correct bytes", async () => {
      const hash = "abcdef1234567890";
      const path = storagePath(basePath, hash);
      const content = "hello attachment";

      const bytesWritten = await writeAttachmentBytes(
        path,
        streamFromString(content),
      );

      expect(bytesWritten).toBe(new TextEncoder().encode(content).byteLength);
      expect(await attachmentBytesExist(path)).toBe(true);

      const readBack = await streamToBytes(readAttachmentStream(path));
      expect(new TextDecoder().decode(readBack)).toBe(content);
    });
    it("leaves the previous file intact when a write fails", async () => {
      const hash = "abcdef1234567890";
      const path = storagePath(basePath, hash);
      const prior = "previously stored content";
      await writeAttachmentBytes(path, streamFromString(prior));

      // A source that fails partway through the write.
      let chunks = 0;
      const failing = new ReadableStream<Uint8Array>({
        pull(controller) {
          chunks += 1;
          if (chunks <= 2) {
            controller.enqueue(new TextEncoder().encode("partial-"));
          } else {
            controller.error(new Error("simulated mid-write failure"));
          }
        },
      });

      await expect(writeAttachmentBytes(path, failing)).rejects.toThrow();

      // The write went through a temp file, so the failed write never touched
      // the destination: the prior content is still complete.
      const readBack = await streamToBytes(readAttachmentStream(path));
      expect(new TextDecoder().decode(readBack)).toBe(prior);

      // And the temp file was cleaned up.
      const entries = await readdir(dirname(path));
      expect(entries.filter((e) => e.endsWith(".tmp"))).toEqual([]);
    });

    it("removes the temp file when the source fails before the first chunk", async () => {
      // createWriteStream opens lazily, so an unlink issued before the open
      // completes removes nothing and the open then leaves the temp file
      // behind. The other failure tests enqueue two chunks first, which forces
      // the open, so they only catch this when the machine is loaded. Repeat
      // instead: 192 of 200 attempts leaked before the fix.
      const attempts = 50;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const path = storagePath(basePath, `abcdef123456789${attempt}`);
        const failing = new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.error(new Error("failed before the first chunk"));
          },
        });

        await expect(writeAttachmentBytes(path, failing)).rejects.toThrow();
      }

      const leaked: string[] = [];
      for (const dir of await readdir(basePath)) {
        for (const sub of await readdir(join(basePath, dir))) {
          const entries = await readdir(join(basePath, dir, sub));
          leaked.push(...entries.filter((e) => e.endsWith(".tmp")));
        }
      }
      expect(leaked).toEqual([]);
    });

    it("leaves the previous file intact when the destination write fails with no backpressure", async () => {
      const hash = "abcdef1234567890";
      const path = storagePath(basePath, hash);
      const prior = "previously stored content";
      await writeAttachmentBytes(path, streamFromString(prior));

      mockedCreateWriteStream.mockImplementationOnce(
        (tempPath) =>
          flushFailureWriteStream(tempPath as string) as unknown as WriteStream,
      );

      // Well under the stream's 64KB highWaterMark, so `write()` returns true
      // and the read loop never enters its drain-wait: the destination error
      // can only surface through the end of the write.
      await expect(
        writeAttachmentBytes(path, streamFromString("N".repeat(600))),
      ).rejects.toThrow(/ENOSPC/);

      const readBack = await streamToBytes(readAttachmentStream(path));
      expect(new TextDecoder().decode(readBack)).toBe(prior);

      const entries = await readdir(dirname(path));
      expect(entries.filter((e) => e.endsWith(".tmp"))).toEqual([]);
    });

    it("leaves the previous file intact when the temp file fails to open", async () => {
      const hash = "abcdef1234567890";
      const path = storagePath(basePath, hash);
      const prior = "previously stored content";
      await writeAttachmentBytes(path, streamFromString(prior));

      mockedCreateWriteStream.mockImplementationOnce(
        () => openFailureWriteStream() as unknown as WriteStream,
      );

      // A source slow enough that the open failure lands mid-loop, where only
      // an error listener held for the whole write can see it.
      const slow = new ReadableStream<Uint8Array>({
        async pull(controller) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          controller.enqueue(new TextEncoder().encode("late chunk"));
          controller.close();
        },
      });

      await expect(writeAttachmentBytes(path, slow)).rejects.toThrow(/EACCES/);

      const readBack = await streamToBytes(readAttachmentStream(path));
      expect(new TextDecoder().decode(readBack)).toBe(prior);

      const entries = await readdir(dirname(path));
      expect(entries.filter((e) => e.endsWith(".tmp"))).toEqual([]);
    });

    it("never leaves the destination partial while writers write the same hash", async () => {
      const hash = "aaaaaaaaaaaaaaaaaa";
      const path = storagePath(basePath, hash);

      const enc = new TextEncoder();
      const prior = "P".repeat(32 * 1024);
      const next = "N".repeat(256 * 1024);
      const priorBytes = enc.encode(prior);
      const nextBytes = enc.encode(next);
      await writeAttachmentBytes(path, streamFromString(prior));

      let seenTorn = false;
      let reads = 0;
      let running = true;
      // Poll the destination while the writers run: it must only ever hold a
      // complete file (the prior or the next content), never a partial one.
      const poll = (async () => {
        // `running` is flipped by the outer scope once the writers settle,
        // which TS can't see across this async boundary.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (running) {
          try {
            const got = await streamToBytes(readAttachmentStream(path));
            if (bytesEqual(got, priorBytes) || bytesEqual(got, nextBytes)) {
              reads += 1;
            } else {
              seenTorn = true;
              break;
            }
          } catch {
            // Losing a race with a rename can transiently fail to open the
            // file; that is not a torn write, so keep polling.
          }
          await new Promise((r) => setImmediate(r));
        }
      })();

      await Promise.allSettled(
        Array.from({ length: 4 }, () =>
          writeAttachmentBytes(path, chunkedStream(next, 1024)),
        ),
      );
      running = false;
      await poll;

      expect(seenTorn).toBe(false);
      expect(reads).toBeGreaterThan(0);
      const final = await streamToBytes(readAttachmentStream(path));
      expect(bytesEqual(final, nextBytes)).toBe(true);
    });
  });

  describe("readAttachmentStream", () => {
    it("returns stream with correct content", async () => {
      const hash = "1234abcd5678efgh";
      const path = storagePath(basePath, hash);
      const content = "stream test data";

      await writeAttachmentBytes(path, streamFromString(content));

      const stream = readAttachmentStream(path);
      const bytes = await streamToBytes(stream);
      expect(new TextDecoder().decode(bytes)).toBe(content);
    });
  });

  describe("deleteAttachmentBytes", () => {
    it("removes file from disk", async () => {
      const hash = "deadbeef12345678";
      const path = storagePath(basePath, hash);

      await writeAttachmentBytes(path, streamFromString("to delete"));
      expect(await attachmentBytesExist(path)).toBe(true);

      await deleteAttachmentBytes(path);
      expect(await attachmentBytesExist(path)).toBe(false);
    });

    it("is a no-op for missing file", async () => {
      const path = join(basePath, "nonexistent");
      await expect(deleteAttachmentBytes(path)).resolves.toBeUndefined();
    });
  });
});
