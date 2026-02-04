import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CollectionMembershipCache,
  type ICollectionMembershipCache,
} from "../../src/cache/collection-membership-cache.js";
import type { IOperationIndex } from "../../src/cache/operation-index-types.js";

function createMockOperationIndex(): IOperationIndex {
  return {
    start: vi.fn(),
    commit: vi.fn(),
    find: vi.fn(),
    getSinceOrdinal: vi.fn(),
    getLatestTimestampForCollection: vi.fn(),
    getCollectionsForDocuments: vi.fn(),
  };
}

describe("CollectionMembershipCache", () => {
  let cache: ICollectionMembershipCache;
  let mockOperationIndex: IOperationIndex;

  beforeEach(() => {
    mockOperationIndex = createMockOperationIndex();
    cache = new CollectionMembershipCache(mockOperationIndex);
  });

  it("should return cached values without querying index", async () => {
    vi.mocked(mockOperationIndex.getCollectionsForDocuments).mockResolvedValue({
      "doc-1": ["collection-a"],
    });

    // First call populates cache
    await cache.getCollectionsForDocuments(["doc-1"]);
    vi.mocked(mockOperationIndex.getCollectionsForDocuments).mockClear();

    // Second call should hit cache
    const result = await cache.getCollectionsForDocuments(["doc-1"]);

    expect(result).toEqual({ "doc-1": ["collection-a"] });
    expect(
      mockOperationIndex.getCollectionsForDocuments,
    ).not.toHaveBeenCalled();
  });

  it("should query index on cache miss", async () => {
    vi.mocked(mockOperationIndex.getCollectionsForDocuments).mockResolvedValue({
      "doc-1": ["collection-a"],
    });

    const result = await cache.getCollectionsForDocuments(["doc-1"]);

    expect(result).toEqual({ "doc-1": ["collection-a"] });
    expect(mockOperationIndex.getCollectionsForDocuments).toHaveBeenCalledWith([
      "doc-1",
    ]);
  });

  it("should invalidate cache entry and reload from index", async () => {
    vi.mocked(mockOperationIndex.getCollectionsForDocuments)
      .mockResolvedValueOnce({ "doc-1": ["collection-a"] })
      .mockResolvedValueOnce({ "doc-1": ["collection-a", "collection-b"] });

    // First query
    await cache.getCollectionsForDocuments(["doc-1"]);

    // Invalidate (simulating what happens after addToCollection + commit)
    cache.invalidate("doc-1");

    // Next query should hit index again
    const result = await cache.getCollectionsForDocuments(["doc-1"]);

    expect(result).toEqual({ "doc-1": ["collection-a", "collection-b"] });
    expect(mockOperationIndex.getCollectionsForDocuments).toHaveBeenCalledTimes(
      2,
    );
  });

  it("should return empty array for documents with no collections in index", async () => {
    vi.mocked(mockOperationIndex.getCollectionsForDocuments).mockResolvedValue(
      {},
    );

    const result = await cache.getCollectionsForDocuments(["doc-1"]);

    expect(result).toEqual({ "doc-1": [] });
    expect(mockOperationIndex.getCollectionsForDocuments).toHaveBeenCalledWith([
      "doc-1",
    ]);
  });

  it("should only query index for cache misses", async () => {
    vi.mocked(mockOperationIndex.getCollectionsForDocuments)
      .mockResolvedValueOnce({ "doc-1": ["collection-a"] })
      .mockResolvedValueOnce({ "doc-2": ["collection-b"] });

    // First call populates cache for doc-1
    await cache.getCollectionsForDocuments(["doc-1"]);
    vi.mocked(mockOperationIndex.getCollectionsForDocuments).mockClear();

    vi.mocked(mockOperationIndex.getCollectionsForDocuments).mockResolvedValue({
      "doc-2": ["collection-b"],
    });

    // Second call should only query for doc-2
    const result = await cache.getCollectionsForDocuments(["doc-1", "doc-2"]);

    expect(result).toEqual({
      "doc-1": ["collection-a"],
      "doc-2": ["collection-b"],
    });
    expect(mockOperationIndex.getCollectionsForDocuments).toHaveBeenCalledWith([
      "doc-2",
    ]);
  });

  it("should not affect other documents when invalidating", async () => {
    vi.mocked(mockOperationIndex.getCollectionsForDocuments).mockResolvedValue({
      "doc-1": ["collection-a"],
      "doc-2": ["collection-b"],
    });

    // Populate cache for both documents
    await cache.getCollectionsForDocuments(["doc-1", "doc-2"]);

    // Invalidate only doc-1
    cache.invalidate("doc-1");

    vi.mocked(mockOperationIndex.getCollectionsForDocuments).mockClear();
    vi.mocked(mockOperationIndex.getCollectionsForDocuments).mockResolvedValue({
      "doc-1": ["collection-new"],
    });

    // Query both - should only hit index for doc-1
    const result = await cache.getCollectionsForDocuments(["doc-1", "doc-2"]);

    expect(result).toEqual({
      "doc-1": ["collection-new"],
      "doc-2": ["collection-b"],
    });
    expect(mockOperationIndex.getCollectionsForDocuments).toHaveBeenCalledWith([
      "doc-1",
    ]);
  });

  it("should be a no-op when invalidating non-existent entries", () => {
    expect(() => cache.invalidate("non-existent")).not.toThrow();
  });
});
