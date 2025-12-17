import { describe, expect, it, vi } from "vitest";
import { InternalChannel } from "../../../../src/sync/channels/internal-channel.js";
import { SyncOperation } from "../../../../src/sync/sync-operation.js";
import {
  ChannelErrorSource,
  SyncOperationStatus,
  type SyncEnvelope,
} from "../../../../src/sync/types.js";
import { ChannelError } from "../../../../src/sync/errors.js";
import type { ISyncCursorStorage } from "../../../../src/storage/interfaces.js";
import type { OperationContext } from "../../../../src/storage/interfaces.js";

const createMockCursorStorage = (): ISyncCursorStorage => ({
  list: vi.fn(),
  get: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
});

const createMockSendFunction = () => vi.fn();

const createMockOperationContext = (): OperationContext => ({
  documentId: "doc-1",
  documentType: "test/document",
  scope: "public",
  branch: "main",
  ordinal: 1,
});

const createMockSyncOperation = (
  id: string,
  remoteName: string,
): SyncOperation => {
  return new SyncOperation(id, remoteName, "doc-1", ["public"], "main", [
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
  ]);
};

describe("InternalChannel", () => {
  describe("constructor and initialization", () => {
    it("should create channel with send function", () => {
      const cursorStorage = createMockCursorStorage();
      const sendFn = createMockSendFunction();
      const channel = new InternalChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
        sendFn,
      );

      expect(channel.inbox.items).toHaveLength(0);
      expect(channel.outbox.items).toHaveLength(0);
      expect(channel.deadLetter.items).toHaveLength(0);
    });

    it("should initialize empty mailboxes", () => {
      const cursorStorage = createMockCursorStorage();
      const sendFn = createMockSendFunction();
      const channel = new InternalChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
        sendFn,
      );

      expect(channel.inbox.items).toEqual([]);
      expect(channel.outbox.items).toEqual([]);
      expect(channel.deadLetter.items).toEqual([]);
    });
  });

  describe("outbox to transport", () => {
    it("should send envelope via send function when job added to outbox", () => {
      const cursorStorage = createMockCursorStorage();
      const sendFn = createMockSendFunction();
      const channel = new InternalChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
        sendFn,
      );

      const job = createMockSyncOperation("job-1", "remote-1");
      channel.outbox.add(job);

      expect(sendFn).toHaveBeenCalledTimes(1);
      const envelope = sendFn.mock.calls[0][0] as SyncEnvelope;
      expect(envelope.type).toBe("operations");
      expect(envelope.channelMeta.id).toBe("channel-1");
      expect(envelope.operations).toBe(job.operations);
    });

    it("should transition job status during transport and remove on success", () => {
      const cursorStorage = createMockCursorStorage();
      const sendFn = createMockSendFunction();
      const channel = new InternalChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
        sendFn,
      );

      const job = createMockSyncOperation("job-1", "remote-1");
      const statusCallback = vi.fn();
      job.on(statusCallback);

      expect(job.status).toBe(SyncOperationStatus.Unknown);

      channel.outbox.add(job);

      expect(job.status).toBe(SyncOperationStatus.Applied);
      expect(statusCallback).toHaveBeenCalledTimes(2);
      expect(statusCallback).toHaveBeenNthCalledWith(
        1,
        job,
        SyncOperationStatus.Unknown,
        SyncOperationStatus.TransportPending,
      );
      expect(statusCallback).toHaveBeenNthCalledWith(
        2,
        job,
        SyncOperationStatus.TransportPending,
        SyncOperationStatus.Applied,
      );
      expect(channel.outbox.items).toHaveLength(0);
    });

    it("should send multiple jobs independently", () => {
      const cursorStorage = createMockCursorStorage();
      const sendFn = createMockSendFunction();
      const channel = new InternalChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
        sendFn,
      );

      const job1 = createMockSyncOperation("job-1", "remote-1");
      const job2 = createMockSyncOperation("job-2", "remote-1");
      const job3 = createMockSyncOperation("job-3", "remote-1");

      channel.outbox.add(job1);
      channel.outbox.add(job2);
      channel.outbox.add(job3);

      expect(sendFn).toHaveBeenCalledTimes(3);
    });
  });

  describe("receive envelope", () => {
    it("should convert envelope to job and add to inbox", () => {
      const cursorStorage = createMockCursorStorage();
      const sendFn = createMockSendFunction();
      const channel = new InternalChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
        sendFn,
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
      const sendFn = createMockSendFunction();
      const channel = new InternalChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
        sendFn,
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

  describe("bidirectional communication", () => {
    it("should enable bidirectional communication via send functions", () => {
      const cursorStorage = createMockCursorStorage();

      let channel1: InternalChannel;
      let channel2: InternalChannel;

      channel1 = new InternalChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
        (envelope) => channel2.receive(envelope),
      );
      channel2 = new InternalChannel(
        "channel-2",
        "remote-2",
        cursorStorage,
        (envelope) => channel1.receive(envelope),
      );

      const job = createMockSyncOperation("job-1", "remote-1");
      channel1.outbox.add(job);

      expect(channel2.inbox.items).toHaveLength(1);
      expect(channel2.inbox.items[0].remoteName).toBe("remote-2");
      expect(channel2.inbox.items[0].status).toBe(
        SyncOperationStatus.ExecutionPending,
      );
    });
  });

  describe("inbox processing", () => {
    it("should allow consumer to register inbox callback", () => {
      const cursorStorage = createMockCursorStorage();
      const sendFn = createMockSendFunction();
      const channel = new InternalChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
        sendFn,
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
    });

    it("should allow jobs to be marked as executed", () => {
      const cursorStorage = createMockCursorStorage();
      const sendFn = createMockSendFunction();
      const channel = new InternalChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
        sendFn,
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
      const sendFn = createMockSendFunction();
      const channel = new InternalChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
        sendFn,
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

    it("should support moving failed jobs to dead letter", () => {
      const cursorStorage = createMockCursorStorage();
      const sendFn = createMockSendFunction();
      const channel = new InternalChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
        sendFn,
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

      channel.inbox.remove(job);
      channel.deadLetter.add(job);

      expect(channel.inbox.items).toHaveLength(0);
      expect(channel.deadLetter.items).toHaveLength(1);
      expect(channel.deadLetter.items[0]).toBe(job);
    });

    it("should support removing executed jobs from inbox", () => {
      const cursorStorage = createMockCursorStorage();
      const sendFn = createMockSendFunction();
      const channel = new InternalChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
        sendFn,
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
      job.executed();
      channel.inbox.remove(job);

      expect(channel.inbox.items).toHaveLength(0);
    });
  });

  describe("cursor updates", () => {
    it("should update cursor with correct parameters", async () => {
      const cursorStorage = createMockCursorStorage();
      const sendFn = createMockSendFunction();
      const channel = new InternalChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
        sendFn,
      );

      await channel.updateCursor(42);

      expect(cursorStorage.upsert).toHaveBeenCalledTimes(1);
      const call = vi.mocked(cursorStorage.upsert).mock.calls[0];
      expect(call[0]).toMatchObject({
        cursorOrdinal: 42,
      });
      expect(call[0].lastSyncedAtUtcMs).toBeGreaterThan(0);
    });

    it("should update cursor multiple times", async () => {
      const cursorStorage = createMockCursorStorage();
      const sendFn = createMockSendFunction();
      const channel = new InternalChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
        sendFn,
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

  describe("error handling", () => {
    it("should handle send function errors", () => {
      const cursorStorage = createMockCursorStorage();
      const sendFn = vi.fn(() => {
        throw new Error("Send failed");
      });

      const channel = new InternalChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
        sendFn,
      );

      const job = createMockSyncOperation("job-1", "remote-1");
      channel.outbox.add(job);

      expect(job.status).toBe(SyncOperationStatus.Error);
      expect(channel.deadLetter.items).toHaveLength(1);
      expect(channel.outbox.items).toHaveLength(0);
    });
  });

  describe("shutdown", () => {
    it("should prevent receiving envelopes after shutdown", () => {
      const cursorStorage = createMockCursorStorage();
      const sendFn = createMockSendFunction();
      const channel = new InternalChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
        sendFn,
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
      const sendFn = createMockSendFunction();
      const channel = new InternalChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
        sendFn,
      );

      expect(() => channel.shutdown()).not.toThrow();
    });

    it("should not send after shutdown", () => {
      const cursorStorage = createMockCursorStorage();
      const sendFn = createMockSendFunction();
      const channel = new InternalChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
        sendFn,
      );

      channel.shutdown();

      const job = createMockSyncOperation("job-1", "remote-1");
      channel.outbox.add(job);

      expect(sendFn).not.toHaveBeenCalled();
    });

    it("should preserve jobs added after shutdown in mailboxes", () => {
      const cursorStorage = createMockCursorStorage();
      const sendFn = createMockSendFunction();
      const channel = new InternalChannel(
        "channel-1",
        "remote-1",
        cursorStorage,
        sendFn,
      );

      channel.shutdown();

      const job = createMockSyncOperation("job-1", "remote-1");
      channel.outbox.add(job);

      expect(channel.outbox.items).toHaveLength(1);
      expect(channel.outbox.items[0]).toBe(job);
      expect(sendFn).not.toHaveBeenCalled();
    });
  });
});
