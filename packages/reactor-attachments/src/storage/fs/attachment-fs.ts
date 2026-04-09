import { mkdir, rm, access } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { join, dirname } from "node:path";
import { Readable } from "node:stream";

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
