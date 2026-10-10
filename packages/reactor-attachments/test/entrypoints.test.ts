import { describe, expect, it } from "vitest";
import * as packageRoot from "../index.js";
import * as clientEntry from "../src/client.js";
import * as replicationEntry from "../src/replication-entry.js";

describe("package export surfaces", () => {
  it("exposes the Task 01 server contract from the real package root", () => {
    expect(packageRoot.parseAttachmentUploadTarget).toBeTypeOf("function");
    expect(packageRoot.parseAttachmentDownloadTarget).toBeTypeOf("function");
    expect(packageRoot.FilesystemAttachmentBackend).toBeTypeOf("function");
    expect(packageRoot.AttachmentSchemaCompiler).toBeTypeOf("function");
    expect(packageRoot.AttachmentReferenceReadModel).toBeTypeOf("function");
    expect(packageRoot.ATTACHMENT_REFERENCE_READ_MODEL_ID).toBe(
      "attachment-reference-read-model",
    );
  });

  it("exposes target parsers but no server backend from the client entry", () => {
    expect(clientEntry.parseAttachmentUploadTarget).toBeTypeOf("function");
    expect(clientEntry.parseAttachmentDownloadTarget).toBeTypeOf("function");
    expect("FilesystemAttachmentBackend" in clientEntry).toBe(false);
    expect("AttachmentSchemaCompiler" in clientEntry).toBe(false);
    expect("AttachmentReferenceReadModel" in clientEntry).toBe(false);
  });

  it("exposes the byte-movement surface from the replication entry, with no server backend", () => {
    expect(replicationEntry.LocalAttachmentStore).toBeTypeOf("function");
    expect(replicationEntry.IdbAttachmentBackend).toBeTypeOf("function");
    expect(replicationEntry.MemoryAttachmentBackend).toBeTypeOf("function");
    expect(replicationEntry.AttachmentReplicator).toBeTypeOf("function");
    expect(replicationEntry.LocalAttachmentTransport).toBeTypeOf("function");
    expect(replicationEntry.LocalAttachmentServer).toBeTypeOf("function");
    expect(replicationEntry.SchemaCompiledOperationRefs).toBeTypeOf("function");
    expect("FilesystemAttachmentBackend" in replicationEntry).toBe(false);
    expect("S3AttachmentBackend" in replicationEntry).toBe(false);
    expect("KyselyAttachmentStore" in replicationEntry).toBe(false);
    expect("AttachmentService" in replicationEntry).toBe(false);
  });

  it("exports each replication symbol from the replication entry only", () => {
    const names = Object.keys(replicationEntry);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => name in packageRoot)).toEqual([]);
    expect(names.filter((name) => name in clientEntry)).toEqual([]);
  });
});
