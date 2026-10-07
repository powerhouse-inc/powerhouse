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
    expect(replicationEntry.SwitchboardAttachmentTransport).toBeTypeOf(
      "function",
    );
    // Needed to find the refs the replicator chases, which is why this entry
    // exists separately from ./client.
    expect(replicationEntry.SchemaCompiledOperationRefs).toBeTypeOf("function");
    expect(replicationEntry.AttachmentSchemaCompiler).toBeTypeOf("function");
    // The point of the entry: no filesystem or S3 backend, so a browser
    // reactor (or the monitor hosting library) does not pull an AWS SDK in to
    // replicate bytes.
    expect("FilesystemAttachmentBackend" in replicationEntry).toBe(false);
    expect("S3AttachmentBackend" in replicationEntry).toBe(false);
    expect("KyselyAttachmentStore" in replicationEntry).toBe(false);
    expect("AttachmentService" in replicationEntry).toBe(false);
  });
});
