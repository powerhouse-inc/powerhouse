import { describe, expect, it } from "vitest";
import * as packageRoot from "../index.js";
import * as clientEntry from "../src/client.js";

describe("package export surfaces", () => {
  it("exposes the Task 01 server contract from the real package root", () => {
    expect(packageRoot.parseAttachmentUploadTarget).toBeTypeOf("function");
    expect(packageRoot.parseAttachmentDownloadTarget).toBeTypeOf("function");
    expect(packageRoot.FilesystemAttachmentBackend).toBeTypeOf("function");
    expect(packageRoot.AttachmentSchemaCompiler).toBeTypeOf("function");
  });

  it("exposes target parsers but no server backend from the client entry", () => {
    expect(clientEntry.parseAttachmentUploadTarget).toBeTypeOf("function");
    expect(clientEntry.parseAttachmentDownloadTarget).toBeTypeOf("function");
    expect("FilesystemAttachmentBackend" in clientEntry).toBe(false);
    expect("AttachmentSchemaCompiler" in clientEntry).toBe(false);
  });
});
