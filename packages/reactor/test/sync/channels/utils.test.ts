import { describe, expect, it } from "vitest";
import { envelopeToSyncOperation } from "../../../src/sync/channels/utils.js";
import type { SyncEnvelope } from "../../../src/sync/types.js";
import { SyncOperationStatus } from "../../../src/sync/types.js";

describe("envelopeToSyncOperation", () => {
  it("should convert envelope to sync operation", () => {
    const envelope: SyncEnvelope = {
      type: "operations",
      channelMeta: { id: "channel-1" },
      operations: [
        {
          operation: {
            index: 0,
            skip: 0,
            id: "op-1",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            hash: "hash-1",
            action: {
              type: "TEST_OP",
              id: "action-1",
              scope: "public",
              timestampUtcMs: "2024-01-01T00:00:00.000Z",
              input: {},
            },
          },
          context: {
            documentId: "doc-1",
            documentType: "test/document",
            scope: "public",
            branch: "main",
          },
        },
      ],
    };

    const syncOp = envelopeToSyncOperation(envelope, "remote-1");

    expect(syncOp.remoteName).toBe("remote-1");
    expect(syncOp.documentId).toBe("doc-1");
    expect(syncOp.branch).toBe("main");
    expect(syncOp.scopes).toEqual(["public"]);
    expect(syncOp.operations).toBe(envelope.operations);
    expect(syncOp.status).toBe(SyncOperationStatus.Unknown);
  });

  it("should extract multiple scopes from operations", () => {
    const envelope: SyncEnvelope = {
      type: "operations",
      channelMeta: { id: "channel-1" },
      operations: [
        {
          operation: {
            index: 0,
            skip: 0,
            id: "op-1",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            hash: "hash-1",
            action: {
              type: "TEST_OP",
              id: "action-1",
              scope: "public",
              timestampUtcMs: "2024-01-01T00:00:00.000Z",
              input: {},
            },
          },
          context: {
            documentId: "doc-1",
            documentType: "test/document",
            scope: "public",
            branch: "main",
          },
        },
        {
          operation: {
            index: 1,
            skip: 0,
            id: "op-2",
            timestampUtcMs: "2024-01-01T00:00:01.000Z",
            hash: "hash-2",
            action: {
              type: "TEST_OP",
              id: "action-2",
              scope: "protected",
              timestampUtcMs: "2024-01-01T00:00:01.000Z",
              input: {},
            },
          },
          context: {
            documentId: "doc-1",
            documentType: "test/document",
            scope: "protected",
            branch: "main",
          },
        },
      ],
    };

    const syncOp = envelopeToSyncOperation(envelope, "remote-1");

    expect(syncOp.scopes).toEqual(["public", "protected"]);
  });

  it("should deduplicate scopes", () => {
    const envelope: SyncEnvelope = {
      type: "operations",
      channelMeta: { id: "channel-1" },
      operations: [
        {
          operation: {
            index: 0,
            skip: 0,
            id: "op-1",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            hash: "hash-1",
            action: {
              type: "TEST_OP",
              id: "action-1",
              scope: "public",
              timestampUtcMs: "2024-01-01T00:00:00.000Z",
              input: {},
            },
          },
          context: {
            documentId: "doc-1",
            documentType: "test/document",
            scope: "public",
            branch: "main",
          },
        },
        {
          operation: {
            index: 1,
            skip: 0,
            id: "op-2",
            timestampUtcMs: "2024-01-01T00:00:01.000Z",
            hash: "hash-2",
            action: {
              type: "TEST_OP",
              id: "action-2",
              scope: "public",
              timestampUtcMs: "2024-01-01T00:00:01.000Z",
              input: {},
            },
          },
          context: {
            documentId: "doc-1",
            documentType: "test/document",
            scope: "public",
            branch: "main",
          },
        },
      ],
    };

    const syncOp = envelopeToSyncOperation(envelope, "remote-1");

    expect(syncOp.scopes).toEqual(["public"]);
  });

  it("should generate unique sync operation ID", () => {
    const envelope: SyncEnvelope = {
      type: "operations",
      channelMeta: { id: "channel-1" },
      operations: [
        {
          operation: {
            index: 0,
            skip: 0,
            id: "op-1",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            hash: "hash-1",
            action: {
              type: "TEST_OP",
              id: "action-1",
              scope: "public",
              timestampUtcMs: "2024-01-01T00:00:00.000Z",
              input: {},
            },
          },
          context: {
            documentId: "doc-1",
            documentType: "test/document",
            scope: "public",
            branch: "main",
          },
        },
      ],
    };

    const syncOp1 = envelopeToSyncOperation(envelope, "remote-1");
    const syncOp2 = envelopeToSyncOperation(envelope, "remote-1");

    expect(syncOp1.id).not.toBe(syncOp2.id);
    expect(syncOp1.id).toContain("syncop-channel-1-");
    expect(syncOp2.id).toContain("syncop-channel-1-");
  });

  it("should throw error if envelope has no operations", () => {
    const envelope: SyncEnvelope = {
      type: "operations",
      channelMeta: { id: "channel-1" },
      operations: undefined,
    };

    expect(() => envelopeToSyncOperation(envelope, "remote-1")).toThrow(
      "Cannot create SyncOperation from envelope without operations",
    );
  });

  it("should throw error if envelope has empty operations array", () => {
    const envelope: SyncEnvelope = {
      type: "operations",
      channelMeta: { id: "channel-1" },
      operations: [],
    };

    expect(() => envelopeToSyncOperation(envelope, "remote-1")).toThrow(
      "Cannot create SyncOperation from envelope without operations",
    );
  });
});
