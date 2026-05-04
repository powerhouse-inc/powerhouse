import { mkdir, rm, access } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { Readable } from "node:stream";
import { UploadTooLarge } from "../../errors.js";

/**
 * Compute the absolute storage path for an attachment hash.
 * Uses a 2-level directory fan-out to avoid millions of files
 * in a single directory: ab/cd/abcdef123456...
 */
export function storagePath(basePath: string, hash: string): string {
  return join(basePath, storageRelativePath(hash));
}

/**
 * Compute the relative storage path for an attachment hash.
 * This is what gets stored in the database's storage_path column.
 */
export function storageRelativePath(hash: string): string {
  return join(hash.slice(0, 2), hash.slice(2, 4), hash);
}

/**
 * Write a ReadableStream to disk. Creates parent directories as needed.
 * Returns the number of bytes written.
 */
export async function writeAttachmentBytes(
  path: string,
  data: ReadableStream<Uint8Array>,
): Promise<number> {
  await mkdir(dirname(path), { recursive: true });

  const writer = createWriteStream(path);
  const reader = data.getReader();
  let bytesWritten = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesWritten += value.byteLength;
      const canContinue = writer.write(value);
      if (!canContinue) {
        await new Promise<void>((resolve) => writer.once("drain", resolve));
      }
    }
  } finally {
    reader.releaseLock();
    await new Promise<void>((resolve, reject) => {
      writer.end(() => resolve());
      writer.on("error", reject);
    });
  }

  return bytesWritten;
}

/**
 * Open a ReadableStream from a file on disk.
 */
export function readAttachmentStream(path: string): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(path);
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
}

/**
 * Delete a file from disk. No-op if the file does not exist.
 */
export async function deleteAttachmentBytes(path: string): Promise<void> {
  await rm(path, { force: true });
}

/**
 * Check whether a file exists on disk.
 */
export async function attachmentBytesExist(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a ReadableStream from an in-memory buffer.
 */
export function streamFromBuffer(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

/**
 * Stream bytes to a temp file under `${basePath}/.tmp/` while computing the
 * SHA-256 hash, returning the temp path, hex hash, and total bytes written.
 *
 * Bytes are never buffered in memory beyond the current chunk. The caller is
 * responsible for renaming the temp file to its final hash-derived location
 * (or removing it if the content is a duplicate).
 *
 * If `maxBytes` is set and the input exceeds it, the temp file is removed and
 * `UploadTooLarge` is thrown.
 */
export async function streamHashAndWrite(
  basePath: string,
  data: ReadableStream<Uint8Array>,
  options: { maxBytes?: number } = {},
): Promise<{ tempPath: string; hash: string; sizeBytes: number }> {
  const { maxBytes } = options;
  const tmpDir = join(basePath, ".tmp");
  await mkdir(tmpDir, { recursive: true });
  const tempPath = join(tmpDir, randomUUID());

  const hasher = createHash("sha256");
  const writer = createWriteStream(tempPath);
  const reader = data.getReader();
  let sizeBytes = 0;
  let caughtError: Error | undefined;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      sizeBytes += value.byteLength;
      if (maxBytes !== undefined && sizeBytes > maxBytes) {
        throw new UploadTooLarge(maxBytes);
      }
      hasher.update(value);
      const canContinue = writer.write(value);
      if (!canContinue) {
        await new Promise<void>((resolve, reject) => {
          const onDrain = () => {
            writer.off("error", onError);
            resolve();
          };
          const onError = (err: Error) => {
            writer.off("drain", onDrain);
            reject(err);
          };
          writer.once("drain", onDrain);
          writer.once("error", onError);
        });
      }
    }
  } catch (err) {
    caughtError = err instanceof Error ? err : new Error(String(err));
  } finally {
    reader.releaseLock();
  }

  await new Promise<void>((resolve, reject) => {
    writer.end((err?: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
    writer.on("error", reject);
  });

  if (caughtError) {
    await rm(tempPath, { force: true });
    throw caughtError;
  }

  return {
    tempPath,
    hash: hasher.digest("hex"),
    sizeBytes,
  };
}
