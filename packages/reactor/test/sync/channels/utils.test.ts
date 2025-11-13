import { describe, expect, it } from "vitest";
import { envelopeToJobHandle } from "../../../src/sync/channels/utils.js";
import type { SyncEnvelope } from "../../../src/sync/types.js";
import { JobChannelStatus } from "../../../src/sync/types.js";

describe("envelopeToJobHandle", () => {
  it("should convert envelope to job handle", () => {
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

    const job = envelopeToJobHandle(envelope, "remote-1");

    expect(job.remoteName).toBe("remote-1");
    expect(job.documentId).toBe("doc-1");
    expect(job.branch).toBe("main");
    expect(job.scopes).toEqual(["public"]);
    expect(job.operations).toBe(envelope.operations);
    expect(job.status).toBe(JobChannelStatus.Unknown);
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

    const job = envelopeToJobHandle(envelope, "remote-1");

    expect(job.scopes).toEqual(["public", "protected"]);
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

    const job = envelopeToJobHandle(envelope, "remote-1");

    expect(job.scopes).toEqual(["public"]);
  });

  it("should generate unique job ID", () => {
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

    const job1 = envelopeToJobHandle(envelope, "remote-1");
    const job2 = envelopeToJobHandle(envelope, "remote-1");

    expect(job1.id).not.toBe(job2.id);
    expect(job1.id).toContain("job-channel-1-");
    expect(job2.id).toContain("job-channel-1-");
  });

  it("should throw error if envelope has no operations", () => {
    const envelope: SyncEnvelope = {
      type: "operations",
      channelMeta: { id: "channel-1" },
      operations: undefined,
    };

    expect(() => envelopeToJobHandle(envelope, "remote-1")).toThrow(
      "Cannot create JobHandle from envelope without operations",
    );
  });

  it("should throw error if envelope has empty operations array", () => {
    const envelope: SyncEnvelope = {
      type: "operations",
      channelMeta: { id: "channel-1" },
      operations: [],
    };

    expect(() => envelopeToJobHandle(envelope, "remote-1")).toThrow(
      "Cannot create JobHandle from envelope without operations",
    );
  });
});
