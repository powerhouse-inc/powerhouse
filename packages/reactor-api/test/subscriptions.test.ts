import type {
  DocumentChangeEvent,
  IReactorClient,
} from "@powerhousedao/reactor";
import { DocumentChangeType } from "@powerhousedao/reactor";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  matchesJobFilter,
  matchesSearchFilter,
} from "../src/graphql/reactor/adapters.js";
import {
  DocumentChangeFeed,
  ensureJobSubscription,
} from "../src/graphql/reactor/pubsub.js";

describe("Subscription Filtering", () => {
  let mockReactorClient: IReactorClient;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReactorClient = {
      subscribe: vi.fn(() => vi.fn()),
      getJobStatus: vi.fn(),
    } as unknown as IReactorClient;
  });

  describe("matchesSearchFilter", () => {
    const createMockDocument = (type: string, id: string): PHDocument =>
      ({
        header: {
          id,
          documentType: type,
          name: "Test Doc",
          slug: "test",
          createdAtUtcIso: "2024-01-01T00:00:00Z",
          lastModifiedAtUtcIso: "2024-01-01T00:00:00Z",
          branch: "main",
          sig: { publicKey: {} as JsonWebKey, nonce: "test" },
          revision: { global: 1 },
        },
        state: {},
        history: {},
        initialState: {},
        operations: {},
        clipboard: [],
      }) as unknown as PHDocument;

    it("should match events with correct document type", () => {
      const event: DocumentChangeEvent = {
        type: DocumentChangeType.Created,
        documents: [createMockDocument("powerhouse/document-model", "doc-1")],
      };

      const result = matchesSearchFilter(event, {
        type: "powerhouse/document-model",
      });

      expect(result).toBe(true);
    });

    it("should not match events with different document type", () => {
      const event: DocumentChangeEvent = {
        type: DocumentChangeType.Created,
        documents: [createMockDocument("powerhouse/budget-statement", "doc-1")],
      };

      const result = matchesSearchFilter(event, {
        type: "powerhouse/document-model",
      });

      expect(result).toBe(false);
    });

    it("should match events with correct parentId", () => {
      const event: DocumentChangeEvent = {
        type: DocumentChangeType.ChildAdded,
        documents: [createMockDocument("powerhouse/document-model", "child-1")],
        context: {
          parentId: "parent-1",
          childId: "child-1",
        },
      };

      const result = matchesSearchFilter(event, {
        parentId: "parent-1",
      });

      expect(result).toBe(true);
    });

    it("should not match events with different parentId", () => {
      const event: DocumentChangeEvent = {
        type: DocumentChangeType.ChildAdded,
        documents: [createMockDocument("powerhouse/document-model", "child-1")],
        context: {
          parentId: "parent-2",
          childId: "child-1",
        },
      };

      const result = matchesSearchFilter(event, {
        parentId: "parent-1",
      });

      expect(result).toBe(false);
    });

    it("should match events with both type and parentId filters", () => {
      const event: DocumentChangeEvent = {
        type: DocumentChangeType.ChildAdded,
        documents: [createMockDocument("powerhouse/document-model", "child-1")],
        context: {
          parentId: "parent-1",
          childId: "child-1",
        },
      };

      const result = matchesSearchFilter(event, {
        type: "powerhouse/document-model",
        parentId: "parent-1",
      });

      expect(result).toBe(true);
    });

    it("should not match if type matches but parentId does not", () => {
      const event: DocumentChangeEvent = {
        type: DocumentChangeType.ChildAdded,
        documents: [createMockDocument("powerhouse/document-model", "child-1")],
        context: {
          parentId: "parent-2",
          childId: "child-1",
        },
      };

      const result = matchesSearchFilter(event, {
        type: "powerhouse/document-model",
        parentId: "parent-1",
      });

      expect(result).toBe(false);
    });

    it("should match any event when no filters provided", () => {
      const event: DocumentChangeEvent = {
        type: DocumentChangeType.Created,
        documents: [createMockDocument("any/type", "doc-1")],
      };

      const result = matchesSearchFilter(event, {});

      expect(result).toBe(true);
    });

    it("should match if any document in the array matches the type", () => {
      const event: DocumentChangeEvent = {
        type: DocumentChangeType.Created,
        documents: [
          createMockDocument("powerhouse/budget-statement", "doc-1"),
          createMockDocument("powerhouse/document-model", "doc-2"),
        ],
      };

      const result = matchesSearchFilter(event, {
        type: "powerhouse/document-model",
      });

      expect(result).toBe(true);
    });
  });

  describe("matchesJobFilter", () => {
    it("should match when job IDs are the same", () => {
      const result = matchesJobFilter(
        { jobId: "job-123" },
        { jobId: "job-123" },
      );

      expect(result).toBe(true);
    });

    it("should not match when job IDs are different", () => {
      const result = matchesJobFilter(
        { jobId: "job-123" },
        { jobId: "job-456" },
      );

      expect(result).toBe(false);
    });
  });

  describe("Per-subject document feeds", () => {
    const alice = { address: "0xalice", key: "did:key:zAlice" };
    const bob = { address: "0xbob", key: undefined };

    it("shares one reactor subscription per subject", () => {
      const feed = new DocumentChangeFeed(mockReactorClient);
      const first = feed.subscribe(alice);
      const second = feed.subscribe(alice);

      expect(mockReactorClient.subscribe).toHaveBeenCalledTimes(1);
      expect(mockReactorClient.subscribe).toHaveBeenCalledWith(
        {},
        expect.any(Function),
        { subject: alice },
      );

      void first.return?.();
      void second.return?.();
    });

    it("reads a different subject through its own subscription", () => {
      const feed = new DocumentChangeFeed(mockReactorClient);
      const first = feed.subscribe(alice);
      const second = feed.subscribe(bob);
      const anonymous = feed.subscribe({});

      expect(mockReactorClient.subscribe).toHaveBeenCalledTimes(3);
      expect(
        vi.mocked(mockReactorClient.subscribe).mock.calls.map((c) => c[2]),
      ).toEqual([{ subject: alice }, { subject: bob }, { subject: {} }]);

      void first.return?.();
      void second.return?.();
      void anonymous.return?.();
    });

    it("unsubscribes when the subject's last subscriber returns", async () => {
      const mockUnsubscribe = vi.fn();
      vi.mocked(mockReactorClient.subscribe).mockReturnValue(mockUnsubscribe);
      const feed = new DocumentChangeFeed(mockReactorClient);

      const first = feed.subscribe(alice);
      const second = feed.subscribe(alice);

      await first.return?.();
      await first.return?.();
      expect(mockUnsubscribe).not.toHaveBeenCalled();

      await second.return?.();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);

      const third = feed.subscribe(alice);
      expect(mockReactorClient.subscribe).toHaveBeenCalledTimes(2);
      await third.return?.();
    });

    it("delivers an event only to its subject's subscribers", async () => {
      const callbacks: Array<(event: DocumentChangeEvent) => void> = [];
      vi.mocked(mockReactorClient.subscribe).mockImplementation(
        (_search, callback) => {
          callbacks.push(callback);
          return vi.fn();
        },
      );
      const feed = new DocumentChangeFeed(mockReactorClient);
      const asAlice = feed.subscribe(alice);
      const asBob = feed.subscribe(bob);
      const aliceNext = asAlice.next();
      const bobNext = asBob.next();
      await Promise.resolve();

      const event: DocumentChangeEvent = {
        type: DocumentChangeType.Created,
        documents: [],
      };
      callbacks[0](event);

      expect((await aliceNext).value).toEqual(
        expect.objectContaining({ documentChanges: event }),
      );
      const bobGot = await Promise.race([
        bobNext.then(() => "event"),
        new Promise((resolve) => setTimeout(() => resolve("nothing"), 20)),
      ]);
      expect(bobGot).toBe("nothing");

      await asAlice.return?.();
      await asBob.return?.();
    });
  });

  describe("Job Subscription Reference Counting", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should create only one job subscription per job ID", () => {
      vi.mocked(mockReactorClient.getJobStatus).mockResolvedValue({
        id: "job-1",
        documentId: "doc-1",
        status: "PENDING" as any,
        createdAtUtcIso: "2024-01-01T00:00:00Z",
        consistencyToken: {
          version: 1,
          createdAtUtcIso: "2024-01-01T00:00:00Z",
          coordinates: [],
        },
        meta: { batchId: "batch-1", batchJobIds: ["job-1"] },
      });

      const cleanup1 = ensureJobSubscription(mockReactorClient, "job-1");
      const cleanup2 = ensureJobSubscription(mockReactorClient, "job-1");

      expect(mockReactorClient.getJobStatus).toHaveBeenCalledTimes(1);

      cleanup1();
      cleanup2();
    });

    it("should create separate subscriptions for different job IDs", () => {
      vi.mocked(mockReactorClient.getJobStatus).mockResolvedValue({
        id: "job-1",
        documentId: "doc-1",
        status: "PENDING" as any,
        createdAtUtcIso: "2024-01-01T00:00:00Z",
        consistencyToken: {
          version: 1,
          createdAtUtcIso: "2024-01-01T00:00:00Z",
          coordinates: [],
        },
        meta: { batchId: "batch-1", batchJobIds: ["job-1"] },
      });

      const cleanup1 = ensureJobSubscription(mockReactorClient, "job-1");
      const cleanup2 = ensureJobSubscription(mockReactorClient, "job-2");

      expect(mockReactorClient.getJobStatus).toHaveBeenCalledWith("job-1");
      expect(mockReactorClient.getJobStatus).toHaveBeenCalledWith("job-2");

      cleanup1();
      cleanup2();
    });
  });
});
