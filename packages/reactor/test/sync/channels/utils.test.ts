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
            ordinal: 1,
          },
        },
      ],
    };

    const syncOp = envelopeToSyncOperation(envelope, "remote-1");

    expect(syncOp.remoteName).toBe("remote-1");
    expect(syncOp.documentId).toBe("doc-1");
    expect(syncOp.branch).toBe("main");
    expect(syncOp.scopes).toEqual(["public"]);
    expect(syncOp.operations).toStrictEqual(envelope.operations);
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
            ordinal: 1,
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
            ordinal: 1,
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
            ordinal: 1,
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
            ordinal: 1,
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
            ordinal: 1,
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

  it("should deserialize string signatures back to tuples", () => {
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
              context: {
                signer: {
                  user: {
                    address: "0x123",
                    networkId: "eip155:1",
                    chainId: 1,
                  },
                  app: {
                    name: "Connect",
                    key: "did:key:zDnaeoPjWQBJhRi3ckGp9LUVdjpuWkyv6xeD5daGWN2wed8UW",
                  },
                  signatures: [
                    "1766004927, did:key:zDnaeoPjWQBJhRi3ckGp9LUVdjpuWkyv6xeD5daGWN2wed8UW, aQ6r1p7z, , 0x71fbbaaabe" as unknown as [
                      string,
                      string,
                      string,
                      string,
                      string,
                    ],
                  ],
                },
              },
            },
          },
          context: {
            documentId: "doc-1",
            documentType: "test/document",
            scope: "public",
            branch: "main",
            ordinal: 1,
          },
        },
      ],
    };

    const syncOp = envelopeToSyncOperation(envelope, "remote-1");

    const signer = syncOp.operations[0].operation.action.context?.signer;
    expect(signer).toBeDefined();
    expect(signer?.signatures).toHaveLength(1);
    expect(signer?.signatures[0]).toEqual([
      "1766004927",
      "did:key:zDnaeoPjWQBJhRi3ckGp9LUVdjpuWkyv6xeD5daGWN2wed8UW",
      "aQ6r1p7z",
      "",
      "0x71fbbaaabe",
    ]);
  });

  it("should preserve tuple signatures if already in correct format", () => {
    const signatureTuple: [string, string, string, string, string] = [
      "1766004927",
      "did:key:zDnae",
      "hash",
      "prevHash",
      "0x71fb",
    ];
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
              context: {
                signer: {
                  user: {
                    address: "0x123",
                    networkId: "eip155:1",
                    chainId: 1,
                  },
                  app: {
                    name: "Connect",
                    key: "did:key:zDnae",
                  },
                  signatures: [signatureTuple],
                },
              },
            },
          },
          context: {
            documentId: "doc-1",
            documentType: "test/document",
            scope: "public",
            branch: "main",
            ordinal: 1,
          },
        },
      ],
    };

    const syncOp = envelopeToSyncOperation(envelope, "remote-1");

    const signer = syncOp.operations[0].operation.action.context?.signer;
    expect(signer?.signatures[0]).toEqual(signatureTuple);
  });

  it("should handle operations without signer context", () => {
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
            ordinal: 1,
          },
        },
      ],
    };

    const syncOp = envelopeToSyncOperation(envelope, "remote-1");

    expect(
      syncOp.operations[0].operation.action.context?.signer,
    ).toBeUndefined();
  });
});
