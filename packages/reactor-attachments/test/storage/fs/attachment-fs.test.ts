import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  storagePath,
  storageRelativePath,
  writeAttachmentBytes,
  readAttachmentStream,
  deleteAttachmentBytes,
  attachmentBytesExist,
} from "../../../src/storage/fs/attachment-fs.js";
import { streamFromString, streamToBytes } from "../../factories.js";

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
