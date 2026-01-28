import type { IDocumentStorage } from "document-drive";
import type { PHDocument } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/events/event-bus.js";
import type { IEventBus } from "../../src/events/interfaces.js";
import type { IConsistencyTracker } from "../../src/shared/consistency-tracker.js";
import type {
  ConsistencyCoordinate,
  ConsistencyToken,
} from "../../src/shared/types.js";
import { ConsistencyAwareLegacyStorage } from "../../src/storage/consistency-aware-legacy-storage.js";

function createTestConsistencyToken(
  coordinates: ConsistencyCoordinate[],
): ConsistencyToken {
  return {
    version: 1,
    createdAtUtcIso: new Date().toISOString(),
    coordinates,
  };
}

describe("ConsistencyAwareLegacyStorage", () => {
  let storage: ConsistencyAwareLegacyStorage;
  let mockInnerStorage: IDocumentStorage;
  let mockConsistencyTracker: IConsistencyTracker;
  let eventBus: IEventBus;

  beforeEach(() => {
    eventBus = new EventBus();

    mockInnerStorage = {
      get: vi.fn().mockResolvedValue({ header: { id: "doc-1" } } as PHDocument),
      getBySlug: vi
        .fn()
        .mockResolvedValue({ header: { id: "doc-1" } } as PHDocument),
      exists: vi.fn().mockResolvedValue(true),
      findByType: vi.fn().mockResolvedValue({
        documents: ["doc-1", "doc-2"],
        nextCursor: "cur",
      }),
      getChildren: vi.fn().mockResolvedValue(["child-1", "child-2"]),
      resolveIds: vi.fn().mockResolvedValue(["id-1", "id-2"]),
      resolveSlugs: vi.fn().mockResolvedValue(["slug-1", "slug-2"]),
      getParents: vi.fn().mockResolvedValue(["parent-1", "parent-2"]),
    } as unknown as IDocumentStorage;

    mockConsistencyTracker = {
      waitFor: vi.fn().mockResolvedValue(undefined),
      update: vi.fn(),
      getLatest: vi.fn(),
      serialize: vi.fn(),
      hydrate: vi.fn(),
    };

    storage = new ConsistencyAwareLegacyStorage(
      mockInnerStorage,
      mockConsistencyTracker,
      eventBus,
    );
  });

  describe("get", () => {
    it("should delegate to inner storage", async () => {
      const result = await storage.get<PHDocument>("doc-1");
      expect(mockInnerStorage.get).toHaveBeenCalledWith("doc-1");
      expect(result.header.id).toBe("doc-1");
    });

    it("should wait for consistency when token is provided", async () => {
      const consistencyToken = createTestConsistencyToken([
        {
          documentId: "doc-1",
          scope: "global",
          branch: "main",
          operationIndex: 5,
        },
      ]);

      await storage.get<PHDocument>("doc-1", consistencyToken);

      expect(mockConsistencyTracker.waitFor).toHaveBeenCalledWith(
        consistencyToken.coordinates,
        undefined,
        undefined,
      );
    });

    it("should not wait for consistency when no token is provided", async () => {
      await storage.get<PHDocument>("doc-1");
      expect(mockConsistencyTracker.waitFor).not.toHaveBeenCalled();
    });

    it("should pass abort signal to consistency tracker", async () => {
      const abortController = new AbortController();
      const consistencyToken = createTestConsistencyToken([
        {
          documentId: "doc-1",
          scope: "global",
          branch: "main",
          operationIndex: 5,
        },
      ]);

      await storage.get<PHDocument>(
        "doc-1",
        consistencyToken,
        abortController.signal,
      );

      expect(mockConsistencyTracker.waitFor).toHaveBeenCalledWith(
        consistencyToken.coordinates,
        undefined,
        abortController.signal,
      );
    });
  });

  describe("getBySlug", () => {
    it("should delegate to inner storage", async () => {
      const result = await storage.getBySlug<PHDocument>("my-slug");
      expect(mockInnerStorage.getBySlug).toHaveBeenCalledWith("my-slug");
      expect(result.header.id).toBe("doc-1");
    });

    it("should wait for consistency when token is provided", async () => {
      const consistencyToken = createTestConsistencyToken([
        {
          documentId: "doc-1",
          scope: "global",
          branch: "main",
          operationIndex: 3,
        },
      ]);

      await storage.getBySlug<PHDocument>("my-slug", consistencyToken);

      expect(mockConsistencyTracker.waitFor).toHaveBeenCalledWith(
        consistencyToken.coordinates,
        undefined,
        undefined,
      );
    });
  });

  describe("exists", () => {
    it("should delegate to inner storage", async () => {
      const result = await storage.exists("doc-1");
      expect(mockInnerStorage.exists).toHaveBeenCalledWith("doc-1");
      expect(result).toBe(true);
    });

    it("should wait for consistency when token is provided", async () => {
      const consistencyToken = createTestConsistencyToken([
        {
          documentId: "doc-1",
          scope: "global",
          branch: "main",
          operationIndex: 7,
        },
      ]);

      await storage.exists("doc-1", consistencyToken);

      expect(mockConsistencyTracker.waitFor).toHaveBeenCalledWith(
        consistencyToken.coordinates,
        undefined,
        undefined,
      );
    });
  });

  describe("findByType", () => {
    it("should delegate to inner storage", async () => {
      const result = await storage.findByType("test/type");
      expect(mockInnerStorage.findByType).toHaveBeenCalledWith(
        "test/type",
        undefined,
        undefined,
      );
      expect(result).toEqual({
        documents: ["doc-1", "doc-2"],
        nextCursor: "cur",
      });
    });

    it("should pass limit and cursor to inner storage", async () => {
      await storage.findByType("test/type", 10, "cursor-abc");
      expect(mockInnerStorage.findByType).toHaveBeenCalledWith(
        "test/type",
        10,
        "cursor-abc",
      );
    });

    it("should wait for consistency when token is provided", async () => {
      const consistencyToken = createTestConsistencyToken([
        {
          documentId: "doc-1",
          scope: "global",
          branch: "main",
          operationIndex: 2,
        },
      ]);

      await storage.findByType("test/type", 10, undefined, consistencyToken);

      expect(mockConsistencyTracker.waitFor).toHaveBeenCalledWith(
        consistencyToken.coordinates,
        undefined,
        undefined,
      );
    });

    it("should pass abort signal to consistency tracker", async () => {
      const abortController = new AbortController();
      const consistencyToken = createTestConsistencyToken([
        {
          documentId: "doc-1",
          scope: "global",
          branch: "main",
          operationIndex: 2,
        },
      ]);

      await storage.findByType(
        "test/type",
        10,
        undefined,
        consistencyToken,
        abortController.signal,
      );

      expect(mockConsistencyTracker.waitFor).toHaveBeenCalledWith(
        consistencyToken.coordinates,
        undefined,
        abortController.signal,
      );
    });
  });

  describe("getChildren", () => {
    it("should delegate to inner storage", async () => {
      const result = await storage.getChildren("parent-id");
      expect(mockInnerStorage.getChildren).toHaveBeenCalledWith("parent-id");
      expect(result).toEqual(["child-1", "child-2"]);
    });

    it("should wait for consistency when token is provided", async () => {
      const consistencyToken = createTestConsistencyToken([
        {
          documentId: "parent-id",
          scope: "global",
          branch: "main",
          operationIndex: 4,
        },
      ]);

      await storage.getChildren("parent-id", consistencyToken);

      expect(mockConsistencyTracker.waitFor).toHaveBeenCalledWith(
        consistencyToken.coordinates,
        undefined,
        undefined,
      );
    });

    it("should pass abort signal to consistency tracker", async () => {
      const abortController = new AbortController();
      const consistencyToken = createTestConsistencyToken([
        {
          documentId: "parent-id",
          scope: "global",
          branch: "main",
          operationIndex: 4,
        },
      ]);

      await storage.getChildren(
        "parent-id",
        consistencyToken,
        abortController.signal,
      );

      expect(mockConsistencyTracker.waitFor).toHaveBeenCalledWith(
        consistencyToken.coordinates,
        undefined,
        abortController.signal,
      );
    });
  });

  describe("resolveIds", () => {
    it("should delegate to inner storage", async () => {
      const result = await storage.resolveIds(["slug-1", "slug-2"]);
      expect(mockInnerStorage.resolveIds).toHaveBeenCalledWith(
        ["slug-1", "slug-2"],
        undefined,
      );
      expect(result).toEqual(["id-1", "id-2"]);
    });

    it("should wait for consistency when token is provided", async () => {
      const consistencyToken = createTestConsistencyToken([
        {
          documentId: "doc-1",
          scope: "global",
          branch: "main",
          operationIndex: 6,
        },
      ]);

      await storage.resolveIds(["slug-1"], consistencyToken);

      expect(mockConsistencyTracker.waitFor).toHaveBeenCalledWith(
        consistencyToken.coordinates,
        undefined,
        undefined,
      );
    });

    it("should pass abort signal to inner storage", async () => {
      const abortController = new AbortController();
      await storage.resolveIds(["slug-1"], undefined, abortController.signal);

      expect(mockInnerStorage.resolveIds).toHaveBeenCalledWith(
        ["slug-1"],
        abortController.signal,
      );
    });
  });

  describe("resolveSlugs", () => {
    it("should delegate to inner storage", async () => {
      const result = await storage.resolveSlugs(["id-1", "id-2"]);
      expect(mockInnerStorage.resolveSlugs).toHaveBeenCalledWith(
        ["id-1", "id-2"],
        undefined,
      );
      expect(result).toEqual(["slug-1", "slug-2"]);
    });

    it("should wait for consistency when token is provided", async () => {
      const consistencyToken = createTestConsistencyToken([
        {
          documentId: "doc-1",
          scope: "global",
          branch: "main",
          operationIndex: 8,
        },
      ]);

      await storage.resolveSlugs(["id-1"], consistencyToken);

      expect(mockConsistencyTracker.waitFor).toHaveBeenCalledWith(
        consistencyToken.coordinates,
        undefined,
        undefined,
      );
    });

    it("should pass abort signal to inner storage", async () => {
      const abortController = new AbortController();
      await storage.resolveSlugs(["id-1"], undefined, abortController.signal);

      expect(mockInnerStorage.resolveSlugs).toHaveBeenCalledWith(
        ["id-1"],
        abortController.signal,
      );
    });
  });

  describe("getParents", () => {
    it("should delegate to inner storage", async () => {
      const result = await storage.getParents("child-id");
      expect(mockInnerStorage.getParents).toHaveBeenCalledWith("child-id");
      expect(result).toEqual(["parent-1", "parent-2"]);
    });

    it("should wait for consistency when token is provided", async () => {
      const consistencyToken = createTestConsistencyToken([
        {
          documentId: "child-id",
          scope: "global",
          branch: "main",
          operationIndex: 9,
        },
      ]);

      await storage.getParents("child-id", consistencyToken);

      expect(mockConsistencyTracker.waitFor).toHaveBeenCalledWith(
        consistencyToken.coordinates,
        undefined,
        undefined,
      );
    });

    it("should pass abort signal to consistency tracker", async () => {
      const abortController = new AbortController();
      const consistencyToken = createTestConsistencyToken([
        {
          documentId: "child-id",
          scope: "global",
          branch: "main",
          operationIndex: 9,
        },
      ]);

      await storage.getParents(
        "child-id",
        consistencyToken,
        abortController.signal,
      );

      expect(mockConsistencyTracker.waitFor).toHaveBeenCalledWith(
        consistencyToken.coordinates,
        undefined,
        abortController.signal,
      );
    });
  });

  describe("waitForConsistency edge cases", () => {
    it("should not wait when consistency token has empty coordinates", async () => {
      const consistencyToken = createTestConsistencyToken([]);

      await storage.get<PHDocument>("doc-1", consistencyToken);

      expect(mockConsistencyTracker.waitFor).not.toHaveBeenCalled();
    });

    it("should not wait when consistency token is undefined", async () => {
      await storage.get<PHDocument>("doc-1", undefined);

      expect(mockConsistencyTracker.waitFor).not.toHaveBeenCalled();
    });
  });

  describe("event bus subscription", () => {
    it("should update consistency tracker on OPERATION_WRITTEN event", async () => {
      const { OperationEventTypes } = await import("../../src/events/types.js");

      await eventBus.emit(OperationEventTypes.OPERATION_WRITTEN, {
        operations: [
          {
            context: {
              documentId: "doc-1",
              scope: "global",
              branch: "main",
            },
            operation: {
              index: 5,
            },
          },
        ],
      });

      expect(mockConsistencyTracker.update).toHaveBeenCalledWith([
        {
          documentId: "doc-1",
          scope: "global",
          branch: "main",
          operationIndex: 5,
        },
      ]);
    });

    it("should handle multiple operations in a single event", async () => {
      const { OperationEventTypes } = await import("../../src/events/types.js");

      await eventBus.emit(OperationEventTypes.OPERATION_WRITTEN, {
        operations: [
          {
            context: {
              documentId: "doc-1",
              scope: "global",
              branch: "main",
            },
            operation: {
              index: 1,
            },
          },
          {
            context: {
              documentId: "doc-2",
              scope: "local",
              branch: "feature",
            },
            operation: {
              index: 3,
            },
          },
        ],
      });

      expect(mockConsistencyTracker.update).toHaveBeenCalledWith([
        {
          documentId: "doc-1",
          scope: "global",
          branch: "main",
          operationIndex: 1,
        },
        {
          documentId: "doc-2",
          scope: "local",
          branch: "feature",
          operationIndex: 3,
        },
      ]);
    });
  });
});
