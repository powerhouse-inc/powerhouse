import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ISyncCursorStorage,
  OperationContext,
} from "../../../../src/storage/interfaces.js";
import { GqlChannel } from "../../../../src/sync/channels/gql-channel.js";
import { SyncOperation } from "../../../../src/sync/sync-operation.js";
import {
  SyncOperationStatus,
  type SyncEnvelope,
} from "../../../../src/sync/types.js";

const createMockCursorStorage = (
  remoteName = "remote-1",
): ISyncCursorStorage => {
  const mockGet = vi.fn();
  mockGet.mockResolvedValue({
    remoteName,
    cursorOrdinal: 0,
  });
  return {
    list: vi.fn(),
    get: mockGet,
    upsert: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
};

const createMockOperationContext = (): OperationContext => ({
  documentId: "doc-1",
  documentType: "test/document",
  scope: "public",
  branch: "main",
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

const createMockFetch = (response: any = {}) => {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: response }),
  });
};

describe("GqlChannel", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("constructor and initialization", () => {
    it("should create channel with config", () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch;

      const channel = new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
        authToken: "test-token",
      });

      expect(channel.inbox.items).toHaveLength(0);
      expect(channel.outbox.items).toHaveLength(0);
      expect(channel.deadLetter.items).toHaveLength(0);
    });

    it("should initialize empty mailboxes", () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch;

      const channel = new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
      });

      expect(channel.inbox.items).toEqual([]);
      expect(channel.outbox.items).toEqual([]);
      expect(channel.deadLetter.items).toEqual([]);
    });

    it("should use default config values", () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch;

      const channel = new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
      });

      const health = channel.getHealth();
      expect(health.state).toBe("idle");
      expect(health.failureCount).toBe(0);
    });

    it("should start polling on construction", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch;

      new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
        pollIntervalMs: 5000,
      });

      // Fast-forward time to trigger poll
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe("polling", () => {
    it("should poll remote for operations at configured interval", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch;

      new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
        pollIntervalMs: 3000,
      });

      await vi.advanceTimersByTimeAsync(3000);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(3000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(3000);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should query with correct GraphQL syntax", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch;

      new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
      });

      await vi.advanceTimersByTimeAsync(5000);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/graphql",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          body: expect.stringContaining("pollSyncEnvelopes"),
        }),
      );
    });

    it("should include auth token in headers when provided", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch;

      new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
        authToken: "secret-token",
      });

      await vi.advanceTimersByTimeAsync(5000);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/graphql",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer secret-token",
          }),
        }),
      );
    });

    it("should use cursor from storage when polling", async () => {
      const cursorStorage = createMockCursorStorage();
      vi.mocked(cursorStorage.get).mockResolvedValue({
        remoteName: "remote-1",
        cursorOrdinal: 42,
        lastSyncedAtUtcMs: Date.now(),
      });

      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch;

      new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
      });

      await vi.advanceTimersByTimeAsync(5000);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(callBody.variables.cursorOrdinal).toBe(42);
    });

    it("should use cursor 0 when cursor is at beginning", async () => {
      const cursorStorage = createMockCursorStorage();
      vi.mocked(cursorStorage.get).mockResolvedValue({
        remoteName: "remote-1",
        cursorOrdinal: 0,
      });

      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch;

      new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
      });

      await vi.advanceTimersByTimeAsync(5000);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(callBody.variables.cursorOrdinal).toBe(0);
    });

    it("should add received operations to inbox", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockEnvelope: SyncEnvelope = {
        type: "operations",
        channelMeta: { id: "channel-1" },
        operations: [
          {
            operation: {
              index: 1,
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

      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [mockEnvelope],
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
      });

      await vi.advanceTimersByTimeAsync(5000);

      expect(channel.inbox.items).toHaveLength(1);
      expect(channel.inbox.items[0].status).toBe(
        SyncOperationStatus.ExecutionPending,
      );
    });
  });

  describe("outbox to transport", () => {
    it("should send envelope via GraphQL mutation when job added to outbox", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        pushSyncEnvelope: true,
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
      });

      const job = createMockSyncOperation("job-1", "remote-1");
      channel.outbox.add(job);

      // Wait for async push to complete
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "https://example.com/graphql",
          expect.objectContaining({
            body: expect.stringContaining("pushSyncEnvelope"),
          }),
        );
      });
    });

    it("should transition job status during transport", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        pushSyncEnvelope: true,
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
      });

      const job = createMockSyncOperation("job-1", "remote-1");
      const statusCallback = vi.fn();
      job.on(statusCallback);

      expect(job.status).toBe(SyncOperationStatus.Unknown);

      channel.outbox.add(job);

      await vi.waitFor(() => {
        expect(job.status).toBe(SyncOperationStatus.TransportPending);
      });
    });

    it("should include channel metadata in envelope", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        pushSyncEnvelope: true,
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
      });

      const job = createMockSyncOperation("job-1", "remote-1");
      channel.outbox.add(job);

      await vi.waitFor(() => {
        const pushCall = mockFetch.mock.calls.find((call) =>
          (call[1]?.body as string).includes("pushSyncEnvelope"),
        );
        expect(pushCall).toBeDefined();

        const body = JSON.parse(pushCall![1]?.body as string);
        expect(body.variables.envelope.channelMeta.id).toBe("channel-1");
      });
    });

    it("should move failed push to dead letter", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      global.fetch = mockFetch;

      const channel = new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
      });

      const job = createMockSyncOperation("job-1", "remote-1");
      channel.outbox.add(job);

      await vi.waitFor(() => {
        expect(channel.deadLetter.items).toHaveLength(1);
        expect(channel.outbox.items).toHaveLength(0);
      });
    });
  });

  describe("error handling", () => {
    it("should handle network errors during poll", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      global.fetch = mockFetch;

      const channel = new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
        maxFailures: 3,
      });

      await vi.advanceTimersByTimeAsync(5000);

      const health = channel.getHealth();
      expect(health.failureCount).toBe(1);
      expect(health.state).toBe("running");
    });

    it("should stop polling after max failures", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      global.fetch = mockFetch;

      const channel = new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
        maxFailures: 3,
        pollIntervalMs: 1000,
      });

      // Trigger 3 failures
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);

      const health = channel.getHealth();
      expect(health.failureCount).toBe(3);
      expect(health.state).toBe("error");

      // Should not poll anymore
      mockFetch.mockClear();
      await vi.advanceTimersByTimeAsync(10000);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should reset failure count on success", async () => {
      const cursorStorage = createMockCursorStorage();
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          throw new Error("Network error");
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { pollSyncEnvelopes: [] } }),
        });
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
        pollIntervalMs: 1000,
      });

      await vi.advanceTimersByTimeAsync(1000);
      expect(channel.getHealth().failureCount).toBe(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(channel.getHealth().failureCount).toBe(2);

      await vi.advanceTimersByTimeAsync(1000);
      expect(channel.getHealth().failureCount).toBe(0);
      expect(channel.getHealth().state).toBe("idle");
    });

    it("should handle GraphQL errors", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            errors: [{ message: "GraphQL error" }],
          }),
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
      });

      await vi.advanceTimersByTimeAsync(5000);

      const health = channel.getHealth();
      expect(health.failureCount).toBe(1);
    });

    it("should handle HTTP errors", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
      });

      await vi.advanceTimersByTimeAsync(5000);

      const health = channel.getHealth();
      expect(health.failureCount).toBe(1);
    });
  });

  describe("cursor updates", () => {
    it("should update cursor with correct parameters", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch;

      const channel = new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
      });

      await channel.updateCursor(42);

      expect(cursorStorage.upsert).toHaveBeenCalledTimes(1);
      const call = vi.mocked(cursorStorage.upsert).mock.calls[0];
      expect(call[0]).toMatchObject({
        cursorOrdinal: 42,
      });
      expect(call[0].lastSyncedAtUtcMs).toBeGreaterThan(0);
    });
  });

  describe("shutdown", () => {
    it("should stop polling after shutdown", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch;

      const channel = new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
        pollIntervalMs: 1000,
      });

      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      channel.shutdown();
      mockFetch.mockClear();

      await vi.advanceTimersByTimeAsync(10000);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should allow shutdown with no issues", () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch;

      const channel = new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
      });

      expect(() => channel.shutdown()).not.toThrow();
    });

    it("should preserve existing jobs in mailboxes after shutdown", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        pushSyncEnvelope: true,
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
      });

      const job = createMockSyncOperation("job-1", "remote-1");
      channel.outbox.add(job);

      // Wait for push to start
      await vi.waitFor(() => {
        expect(job.status).toBe(SyncOperationStatus.TransportPending);
      });

      channel.shutdown();

      // Job should still be in outbox
      expect(channel.outbox.items.length).toBeGreaterThan(0);
    });
  });

  describe("health monitoring", () => {
    it("should track last success timestamp", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch;

      const channel = new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
      });

      const beforePoll = Date.now();
      await vi.advanceTimersByTimeAsync(5000);

      const health = channel.getHealth();
      expect(health.lastSuccessUtcMs).toBeGreaterThanOrEqual(beforePoll);
    });

    it("should track last failure timestamp", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      global.fetch = mockFetch;

      const channel = new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
      });

      const beforePoll = Date.now();
      await vi.advanceTimersByTimeAsync(5000);

      const health = channel.getHealth();
      expect(health.lastFailureUtcMs).toBeGreaterThanOrEqual(beforePoll);
    });

    it("should return correct health state transitions", async () => {
      const cursorStorage = createMockCursorStorage();
      let shouldFail = false;
      const mockFetch = vi.fn().mockImplementation(() => {
        if (shouldFail) {
          throw new Error("Network error");
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { pollSyncEnvelopes: [] } }),
        });
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel("channel-1", "remote-1", cursorStorage, {
        url: "https://example.com/graphql",
        pollIntervalMs: 1000,
      });

      // Initial state: idle
      expect(channel.getHealth().state).toBe("idle");

      // After success: idle
      await vi.advanceTimersByTimeAsync(1000);
      expect(channel.getHealth().state).toBe("idle");

      // After failure: running (has failures but under threshold)
      shouldFail = true;
      await vi.advanceTimersByTimeAsync(1000);
      expect(channel.getHealth().state).toBe("running");
    });
  });
});
