import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("S3 backend structure", () => {
  it("has no finalization, temporary, copy, multipart, or deletion path", async () => {
    const source = await readFile(
      new URL("../../../src/storage/s3/backend.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(
      /CopyObjectCommand|DeleteObjectCommand|CreateMultipartUploadCommand|UploadPartCommand|CompleteMultipartUploadCommand/,
    );
    expect(source).not.toMatch(/finaliz|temporaryKey|tempKey|postUpload/i);
  });
});
