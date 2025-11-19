import type {
  DocumentChangeEvent,
  IReactorClient,
} from "@powerhousedao/reactor";
import { DocumentChangeType } from "@powerhousedao/reactor";
import type { PHDocument } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  matchesJobFilter,
  matchesSearchFilter,
} from "../src/graphql/reactor/adapters.js";
import {
  ensureGlobalDocumentSubscription,
  ensureJobSubscription,
  getPubSub,
  SUBSCRIPTION_TRIGGERS,
} from "../src/graphql/reactor/pubsub.js";

describe("Subscription Filtering", () => {
  let mockReactorClient: IReactorClient;
  let mockSubscribeCallback: (event: DocumentChangeEvent) => void;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReactorClient = {
      subscribe: vi.fn((search, callback) => {
        mockSubscribeCallback = callback;
        return vi.fn();
      }),
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

  describe("Global Subscription Pattern", () => {
    it("should create only one reactorClient subscription for multiple subscribers", () => {
      const cleanup1 = ensureGlobalDocumentSubscription(mockReactorClient);
      const cleanup2 = ensureGlobalDocumentSubscription(mockReactorClient);
      const cleanup3 = ensureGlobalDocumentSubscription(mockReactorClient);

      expect(mockReactorClient.subscribe).toHaveBeenCalledTimes(1);

      cleanup1();
      expect(mockReactorClient.subscribe).toHaveBeenCalledTimes(1);

      cleanup2();
      expect(mockReactorClient.subscribe).toHaveBeenCalledTimes(1);

      cleanup3();
    });

    it("should cleanup reactorClient subscription when last subscriber disconnects", () => {
      const mockUnsubscribe = vi.fn();
      vi.mocked(mockReactorClient.subscribe).mockReturnValue(mockUnsubscribe);

      const cleanup1 = ensureGlobalDocumentSubscription(mockReactorClient);
      const cleanup2 = ensureGlobalDocumentSubscription(mockReactorClient);

      cleanup1();
      expect(mockUnsubscribe).not.toHaveBeenCalled();

      cleanup2();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });

    it("should create new subscription after all subscribers disconnect", () => {
      const mockUnsubscribe = vi.fn();
      vi.mocked(mockReactorClient.subscribe).mockReturnValue(mockUnsubscribe);

      const cleanup1 = ensureGlobalDocumentSubscription(mockReactorClient);
      cleanup1();

      expect(mockReactorClient.subscribe).toHaveBeenCalledTimes(1);
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);

      const cleanup2 = ensureGlobalDocumentSubscription(mockReactorClient);
      expect(mockReactorClient.subscribe).toHaveBeenCalledTimes(2);

      cleanup2();
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
        status: "PENDING" as any,
        createdAtUtcIso: "2024-01-01T00:00:00Z",
        consistencyToken: {
          version: 1,
          createdAtUtcIso: "2024-01-01T00:00:00Z",
          coordinates: [],
        },
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
        status: "PENDING" as any,
        createdAtUtcIso: "2024-01-01T00:00:00Z",
        consistencyToken: {
          version: 1,
          createdAtUtcIso: "2024-01-01T00:00:00Z",
          coordinates: [],
        },
      });

      const cleanup1 = ensureJobSubscription(mockReactorClient, "job-1");
      const cleanup2 = ensureJobSubscription(mockReactorClient, "job-2");

      expect(mockReactorClient.getJobStatus).toHaveBeenCalledWith("job-1");
      expect(mockReactorClient.getJobStatus).toHaveBeenCalledWith("job-2");

      cleanup1();
      cleanup2();
    });
  });

  describe("PubSub Integration", () => {
    it("should publish events to correct channel", async () => {
      const publishSpy = vi.spyOn(getPubSub(), "publish");

      ensureGlobalDocumentSubscription(mockReactorClient);

      const mockEvent: DocumentChangeEvent = {
        type: DocumentChangeType.Created,
        documents: [
          {
            header: {
              id: "doc-1",
              documentType: "powerhouse/document-model",
            },
          } as any,
        ],
      };

      mockSubscribeCallback(mockEvent);

      expect(publishSpy).toHaveBeenCalledWith(
        SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES,
        expect.objectContaining({
          documentChanges: mockEvent,
        }),
      );
    });
  });
});
