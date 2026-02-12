import type { OperationContext } from "document-model";
import { describe, expect, it, vi } from "vitest";
import type { ISyncCursorStorage } from "../../../../src/storage/interfaces.js";
import { GqlResponseChannel } from "../../../../src/sync/channels/gql-res-channel.js";
import { ChannelError } from "../../../../src/sync/errors.js";
import { SyncOperation } from "../../../../src/sync/sync-operation.js";
import {
  ChannelErrorSource,
  SyncOperationStatus,
  type SyncEnvelope,
} from "../../../../src/sync/types.js";

const createMockCursorStorage = (): ISyncCursorStorage => ({
  list: vi.fn(),
  get: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
});

const createMockOperationContext = (ordinal: number = 1): OperationContext => ({
  documentId: "doc-1",
  documentType: "test/document",
  scope: "public",
  branch: "main",
  ordinal,
});

const createMockSyncOperation = (
  id: string,
  remoteName: string,
  ordinal: number = 0,
): SyncOperation => {
  return new SyncOperation(
    id,
    "",
    [],
    remoteName,
    "doc-1",
    ["public"],
    "main",
    [
      {
        operation: {
          index: 0,
          skip: 0,
          id: "op-1",
          timestampUtcMs: new Date().toISOString(),
          hash: "hash-1",
          action: {
            type: "TEST_OP",
            id: "action-1",
            scope: "public",
            timestampUtcMs: new Date().toISOString(),
            input: {},
          },
        },
        context: createMockOperationContext(ordinal),
      },
    ],
  );
};

describe("PollingChannel", () => {
  describe("constructor and initialization", () => {
    it("should create channel without send function", () => {
      const cursorStorage = createMockCursorStorage();
      const channel = new GqlResponseChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      expect(channel.inbox.items).toHaveLength(0);
      expect(channel.outbox.items).toHaveLength(0);
      expect(channel.deadLetter.items).toHaveLength(0);
    });

    it("should initialize empty mailboxes", () => {
      const cursorStorage = createMockCursorStorage();
      const channel = new GqlResponseChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      expect(channel.inbox.items).toEqual([]);
      expect(channel.outbox.items).toEqual([]);
      expect(channel.deadLetter.items).toEqual([]);
    });
  });

  describe("outbox behavior", () => {
    it("should keep operations in outbox (no auto-send)", () => {
      const cursorStorage = createMockCursorStorage();
      const channel = new GqlResponseChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      const job = createMockSyncOperation("job-1", "remote-1");
      channel.outbox.add(job);

      expect(channel.outbox.items).toHaveLength(1);
      expect(channel.outbox.items[0]).toBe(job);
    });

    it("should keep multiple operations in outbox", () => {
      const cursorStorage = createMockCursorStorage();
      const channel = new GqlResponseChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      const job1 = createMockSyncOperation("job-1", "remote-1", 1);
      const job2 = createMockSyncOperation("job-2", "remote-1", 2);
      const job3 = createMockSyncOperation("job-3", "remote-1", 3);

      channel.outbox.add(job1);
      channel.outbox.add(job2);
      channel.outbox.add(job3);

      expect(channel.outbox.items).toHaveLength(3);
    });
  });

  describe("receive envelope", () => {
    it("should convert envelope to job and add to inbox", () => {
      const cursorStorage = createMockCursorStorage();
      const channel = new GqlResponseChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      const envelope: SyncEnvelope = {
        type: "operations",
        channelMeta: { id: "channel-2" },
        operations: [
          {
            operation: {
              index: 0,
              skip: 0,
              id: "op-1",
              timestampUtcMs: new Date().toISOString(),
              hash: "hash-1",
              action: {
                type: "TEST_OP",
                id: "action-1",
                scope: "public",
                timestampUtcMs: new Date().toISOString(),
                input: {},
              },
            },
            context: createMockOperationContext(),
          },
        ],
      };

      channel.receive(envelope);

      expect(channel.inbox.items).toHaveLength(1);
      const job = channel.inbox.items[0];
      expect(job.remoteName).toBe("remote-1");
      expect(job.documentId).toBe("doc-1");
      expect(job.status).toBe(SyncOperationStatus.ExecutionPending);
    });

    it("should throw error when receiving after shutdown", () => {
      const cursorStorage = createMockCursorStorage();
      const channel = new GqlResponseChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      channel.shutdown();

      const envelope: SyncEnvelope = {
        type: "operations",
        channelMeta: { id: "channel-2" },
        operations: [
          {
            operation: {
              index: 0,
              skip: 0,
              id: "op-1",
              timestampUtcMs: new Date().toISOString(),
              hash: "hash-1",
              action: {
                type: "TEST_OP",
                id: "action-1",
                scope: "public",
                timestampUtcMs: new Date().toISOString(),
                input: {},
              },
            },
            context: createMockOperationContext(),
          },
        ],
      };

      expect(() => channel.receive(envelope)).toThrow(
        "Channel channel-1 is shutdown and cannot receive envelopes",
      );
    });
  });

  describe("inbox processing", () => {
    it("should allow consumer to register inbox callback", () => {
      const cursorStorage = createMockCursorStorage();
      const channel = new GqlResponseChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      const callback = vi.fn();
      channel.inbox.onAdded(callback);

      const envelope: SyncEnvelope = {
        type: "operations",
        channelMeta: { id: "channel-2" },
        operations: [
          {
            operation: {
              index: 0,
              skip: 0,
              id: "op-1",
              timestampUtcMs: new Date().toISOString(),
              hash: "hash-1",
              action: {
                type: "TEST_OP",
                id: "action-1",
                scope: "public",
                timestampUtcMs: new Date().toISOString(),
                input: {},
              },
            },
            context: createMockOperationContext(),
          },
        ],
      };

      channel.receive(envelope);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([expect.any(SyncOperation)]);
    });

    it("should allow jobs to be marked as executed", () => {
      const cursorStorage = createMockCursorStorage();
      const channel = new GqlResponseChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      const envelope: SyncEnvelope = {
        type: "operations",
        channelMeta: { id: "channel-2" },
        operations: [
          {
            operation: {
              index: 0,
              skip: 0,
              id: "op-1",
              timestampUtcMs: new Date().toISOString(),
              hash: "hash-1",
              action: {
                type: "TEST_OP",
                id: "action-1",
                scope: "public",
                timestampUtcMs: new Date().toISOString(),
                input: {},
              },
            },
            context: createMockOperationContext(),
          },
        ],
      };

      channel.receive(envelope);

      const job = channel.inbox.items[0];
      expect(job.status).toBe(SyncOperationStatus.ExecutionPending);

      job.executed();

      expect(job.status).toBe(SyncOperationStatus.Applied);
    });

    it("should allow jobs to be marked as failed", () => {
      const cursorStorage = createMockCursorStorage();
      const channel = new GqlResponseChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      const envelope: SyncEnvelope = {
        type: "operations",
        channelMeta: { id: "channel-2" },
        operations: [
          {
            operation: {
              index: 0,
              skip: 0,
              id: "op-1",
              timestampUtcMs: new Date().toISOString(),
              hash: "hash-1",
              action: {
                type: "TEST_OP",
                id: "action-1",
                scope: "public",
                timestampUtcMs: new Date().toISOString(),
                input: {},
              },
            },
            context: createMockOperationContext(),
          },
        ],
      };

      channel.receive(envelope);

      const job = channel.inbox.items[0];
      const error = new ChannelError(
        ChannelErrorSource.Inbox,
        new Error("Execution failed"),
      );
      job.failed(error);

      expect(job.status).toBe(SyncOperationStatus.Error);
      expect(job.error).toBe(error);
    });
  });

  describe("cursor updates and acknowledgment", () => {
    it("should update cursor with correct parameters", async () => {
      const cursorStorage = createMockCursorStorage();
      const channel = new GqlResponseChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      await channel.updateCursor(42);

      expect(cursorStorage.upsert).toHaveBeenCalledTimes(1);
      const call = vi.mocked(cursorStorage.upsert).mock.calls[0];
      expect(call[0]).toMatchObject({
        cursorOrdinal: 42,
      });
      expect(call[0].lastSyncedAtUtcMs).toBeGreaterThan(0);
    });

    it("should remove acknowledged operations from outbox", async () => {
      const cursorStorage = createMockCursorStorage();
      const channel = new GqlResponseChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      const job1 = createMockSyncOperation("job-1", "remote-1", 5);
      const job2 = createMockSyncOperation("job-2", "remote-1", 10);
      const job3 = createMockSyncOperation("job-3", "remote-1", 15);

      channel.outbox.add(job1);
      channel.outbox.add(job2);
      channel.outbox.add(job3);

      expect(channel.outbox.items).toHaveLength(3);

      await channel.updateCursor(10);

      expect(channel.outbox.items).toHaveLength(1);
      expect(channel.outbox.items[0]).toBe(job3);
    });

    it("should mark acknowledged operations as executed", async () => {
      const cursorStorage = createMockCursorStorage();
      const channel = new GqlResponseChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      const job = createMockSyncOperation("job-1", "remote-1", 5);
      channel.outbox.add(job);

      expect(job.status).toBe(SyncOperationStatus.Unknown);

      await channel.updateCursor(5);

      expect(job.status).toBe(SyncOperationStatus.Applied);
      expect(channel.outbox.items).toHaveLength(0);
    });

    it("should not remove operations with ordinal greater than cursor", async () => {
      const cursorStorage = createMockCursorStorage();
      const channel = new GqlResponseChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      const job = createMockSyncOperation("job-1", "remote-1", 20);
      channel.outbox.add(job);

      await channel.updateCursor(10);

      expect(channel.outbox.items).toHaveLength(1);
      expect(channel.outbox.items[0]).toBe(job);
    });

    it("should update cursor multiple times", async () => {
      const cursorStorage = createMockCursorStorage();
      const channel = new GqlResponseChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      await channel.updateCursor(10);
      await channel.updateCursor(20);
      await channel.updateCursor(30);

      expect(cursorStorage.upsert).toHaveBeenCalledTimes(3);

      const calls = vi.mocked(cursorStorage.upsert).mock.calls;
      expect(calls[0][0].cursorOrdinal).toBe(10);
      expect(calls[1][0].cursorOrdinal).toBe(20);
      expect(calls[2][0].cursorOrdinal).toBe(30);
    });
  });

  describe("shutdown", () => {
    it("should prevent receiving envelopes after shutdown", () => {
      const cursorStorage = createMockCursorStorage();
      const channel = new GqlResponseChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      channel.shutdown();

      const envelope: SyncEnvelope = {
        type: "operations",
        channelMeta: { id: "channel-2" },
        operations: [
          {
            operation: {
              index: 0,
              skip: 0,
              id: "op-1",
              timestampUtcMs: new Date().toISOString(),
              hash: "hash-1",
              action: {
                type: "TEST_OP",
                id: "action-1",
                scope: "public",
                timestampUtcMs: new Date().toISOString(),
                input: {},
              },
            },
            context: createMockOperationContext(),
          },
        ],
      };

      expect(() => channel.receive(envelope)).toThrow(
        "Channel channel-1 is shutdown and cannot receive envelopes",
      );
    });

    it("should allow shutdown with no issues", () => {
      const cursorStorage = createMockCursorStorage();
      const channel = new GqlResponseChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      expect(() => channel.shutdown()).not.toThrow();
    });

    it("should preserve operations in outbox after shutdown", () => {
      const cursorStorage = createMockCursorStorage();
      const channel = new GqlResponseChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      const job = createMockSyncOperation("job-1", "remote-1");
      channel.outbox.add(job);

      channel.shutdown();

      expect(channel.outbox.items).toHaveLength(1);
      expect(channel.outbox.items[0]).toBe(job);
    });
  });
});
