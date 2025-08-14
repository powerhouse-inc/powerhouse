import {
  documentModelDocumentModelModule,
  DocumentModelModule,
} from "document-model";
import sizeof from "object-sizeof";
import { createClient } from "redis";
import { beforeEach, describe, it, vi } from "vitest";
import {
  createDocument as createDocumentModelDocument,
  DocumentModelState,
} from "../../document-model/index.js";
import { LRUCacheStorage } from "../src/cache/lru.js";
import InMemoryCache from "../src/cache/memory.js";
import { ICache } from "../src/cache/types.js";
import { createDocument as createDriveDocument } from "../src/drive-document-model/gen/utils.js";
import { driveDocumentModelModule } from "../src/drive-document-model/module.js";
import { ReactorBuilder } from "../src/server/builder.js";
import { IDocumentDriveServer } from "../src/server/types.js";
import { MemoryStorage } from "../src/storage/memory.js";
import {
  IDocumentStorage,
  IDriveOperationStorage,
} from "../src/storage/types.js";

const initRedis = async () => {
  const redisClient = createClient({
    url: process.env.REDIS_TLS_URL ?? "redis://localhost:6379",
  });

  redisClient.on("error", (err: string) => {
    console.log("Redis Client Error", err);
    throw new Error("Redis Client Error");
  });

  redisClient.connect();

  return redisClient;
};

// Array of cache implementations to test
const cacheImplementations: [string, () => Promise<ICache>][] = [
  ["InMemoryCache", () => Promise.resolve(new InMemoryCache())],
  [
    "InMemoryCache with LRU with 512KB maxSize",
    () =>
      Promise.resolve(
        new InMemoryCache(new LRUCacheStorage({ maxSize: 512000 })),
      ),
  ],
  // [
  //   "RedisCache",
  //   async () => {
  //     const client = await initRedis();

  //     // Clear the test keys
  //     await client.flushDb();

  //     // Use type assertion to handle Redis client type compatibility
  //     return new RedisCache(client as any);
  //   },
  // ],
];

describe.each(cacheImplementations)("%s", (_, buildCache) => {
  let cache: ICache;
  let storage: IDriveOperationStorage & IDocumentStorage;
  let reactor: IDocumentDriveServer;
  let storageGetSpy: any;
  let storageDeleteSpy: any;
  let cacheGetSpy: any;
  let cacheSetSpy: any;
  let cacheDeleteSpy: any;

  beforeEach(async () => {
    cache = await buildCache();
    storage = new MemoryStorage();

    // Set up spies on storage methods
    storageGetSpy = vi.spyOn(storage, "get");
    storageDeleteSpy = vi.spyOn(storage, "delete");

    // Set up spies on cache methods
    cacheGetSpy = vi.spyOn(cache, "getDocument");
    cacheSetSpy = vi.spyOn(cache, "setDocument");
    cacheDeleteSpy = vi.spyOn(cache, "deleteDocument");

    reactor = new ReactorBuilder([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
    ] as DocumentModelModule[])
      .withCache(cache)
      .withStorage(storage)
      .build();
    await reactor.initialize();
  });

  // Document tests
  describe("document operations", () => {
    it("should set and get a document", async ({ expect }) => {
      const documentId = "test-document-id";
      const document = createDocumentModelDocument();

      await cache.setDocument(documentId, document);
      const retrievedDocument = await cache.getDocument(documentId);

      expect(retrievedDocument).toBeDefined();
      expect(retrievedDocument?.header.documentType).toBe(
        document.header.documentType,
      );
    });

    it("should return undefined when getting a non-existent document", async ({
      expect,
    }) => {
      const documentId = "non-existent-document";

      const retrievedDocument = await cache.getDocument(documentId);

      expect(retrievedDocument).toBeUndefined();
    });

    it("should delete a document", async ({ expect }) => {
      const documentId = "document-to-delete";
      const document = createDocumentModelDocument();

      await cache.setDocument(documentId, document);
      const deletionResult = await cache.deleteDocument(documentId);
      const retrievedDocument = await cache.getDocument(documentId);

      expect(deletionResult).toBe(true);
      expect(retrievedDocument).toBeUndefined();
    });

    it("should return false when deleting a non-existent document", async ({
      expect,
    }) => {
      const documentId = "non-existent-document";

      const deletionResult = await cache.deleteDocument(documentId);

      expect(deletionResult).toBe(false);
    });
  });

  // Drive tests (testing cache behavior through reactor)
  describe("drive operations via reactor", () => {
    it("should cache drive after first getDrive and serve from cache thereafter", async ({
      expect,
    }) => {
      const drive = createDriveDocument();
      const driveId = drive.header.id;

      // Add drive - this should cache it during initialization
      const addedDrive = await reactor.addDrive({
        id: driveId,
        global: drive.state.global,
      });

      expect(storageGetSpy).toHaveBeenCalledWith(driveId);
      expect(cacheGetSpy).toHaveBeenCalledWith(driveId);
      expect(cacheSetSpy).toHaveBeenCalledWith(driveId, addedDrive);
      expect(cacheGetSpy).toHaveResolvedWith(undefined);

      // Clear spy call counts from addDrive operation
      storageGetSpy.mockClear();
      cacheGetSpy.mockClear();
      cacheSetSpy.mockClear();

      // Subsequent get - should hit cache and avoid storage
      const cacheDrive = await reactor.getDrive(driveId);
      expect(addedDrive).toStrictEqual(cacheDrive);
      expect(cacheGetSpy).toHaveBeenCalledWith(driveId);
      expect(storageGetSpy).not.toHaveBeenCalled(); // Should not hit storage since it's cached
    });

    it("should fetch from storage when cache is cleared", async ({
      expect,
    }) => {
      const drive = createDriveDocument();
      const driveId = drive.header.id;

      // Add drive - this caches it
      await reactor.addDrive({ id: driveId, global: drive.state.global });

      // Clear the cache to simulate cache miss
      await cache.deleteDocument(driveId);

      // Clear spy call counts
      storageGetSpy.mockClear();
      cacheGetSpy.mockClear();
      cacheSetSpy.mockClear();

      // Get drive - should miss cache, hit storage, then cache result
      const retrievedDrive = await reactor.getDrive(driveId);
      expect(retrievedDrive).toBeDefined();
      expect(cacheGetSpy).toHaveBeenCalledWith(driveId); // Cache checked first
      expect(storageGetSpy).toHaveBeenCalledWith(driveId); // Then storage hit
      expect(cacheSetSpy).toHaveBeenCalledWith(driveId, retrievedDrive); // Then cached
    });

    it("should delete from both cache and storage", async ({ expect }) => {
      const drive = createDriveDocument();
      const driveId = drive.header.id;

      // Add drive
      await reactor.addDrive({ id: driveId, global: drive.state.global });

      // Get drive to cache it
      await reactor.getDrive(driveId);

      // Clear spy call counts
      cacheDeleteSpy.mockClear();
      storageDeleteSpy.mockClear();

      // Delete drive
      await reactor.deleteDrive(driveId);

      // Verify both cache and storage delete were called
      expect(cacheDeleteSpy).toHaveBeenCalledWith(driveId);
      expect(storageDeleteSpy).toHaveBeenCalledWith(driveId);
    });
  });

  // Document caching tests (testing cache behavior through reactor)
  describe("document caching behavior", () => {
    it("should cache regular documents after first fetch", async ({
      expect,
    }) => {
      const document = createDocumentModelDocument();
      const documentId = document.header.id;

      // Add document to storage
      await storage.create(document);

      // Clear spy call counts
      storageGetSpy.mockClear();
      cacheGetSpy.mockClear();
      cacheSetSpy.mockClear();

      // First get - should hit storage and cache the result
      const firstRetrieve = await reactor.getDocument(documentId);
      expect(firstRetrieve).toBeDefined();
      expect(storageGetSpy).toHaveBeenCalledWith(documentId);
      expect(cacheSetSpy).toHaveBeenCalledWith(documentId, firstRetrieve);

      // Clear spy call counts
      storageGetSpy.mockClear();
      cacheGetSpy.mockClear();
      cacheSetSpy.mockClear();

      // Second get - should hit cache and avoid storage
      const secondRetrieve = await reactor.getDocument(documentId);
      expect(secondRetrieve).toStrictEqual(firstRetrieve);
      expect(cacheGetSpy).toHaveBeenCalledWith(documentId);
      expect(storageGetSpy).not.toHaveBeenCalled();
    });

    it("should handle cache miss gracefully", async ({ expect }) => {
      const document = createDocumentModelDocument();
      const documentId = document.header.id;

      // Add document to storage
      await storage.create(document);

      // Clear cache after storage creation
      await cache.deleteDocument(documentId);

      // Clear spy call counts
      storageGetSpy.mockClear();
      cacheGetSpy.mockClear();
      cacheSetSpy.mockClear();

      // Get document - should miss cache, hit storage, then cache result
      const retrievedDoc = await reactor.getDocument(documentId);
      expect(retrievedDoc).toBeDefined();
      expect(cacheGetSpy).toHaveBeenCalledWith(documentId);
      expect(storageGetSpy).toHaveBeenCalledWith(documentId);
      expect(cacheSetSpy).toHaveBeenCalledWith(documentId, retrievedDoc);
      expect(cacheGetSpy).toHaveResolvedWith(undefined);
    });

    it("should return the same document instance on subsequent gets", async ({
      expect,
    }) => {
      const document = createDocumentModelDocument();
      const documentId = document.header.id;

      await reactor.addDocument(document);

      const firstRetrieve = await reactor.getDocument(documentId);
      const secondRetrieve = await reactor.getDocument(documentId);
      expect(firstRetrieve).toBe(secondRetrieve);
    });
  });
});

// Test specifically for LRU cache behavior
describe("LRU Cache Specific Tests", () => {
  // Helper functions for test data
  function createTestDocument() {
    return createDocumentModelDocument({
      state: {
        global: {
          id: `doc`,
          name: `Document`,
          author: { name: "author", website: "url" },
          description: "x".repeat(100),
          extension: "md",
          specifications: [],
        },
        local: {},
      },
    });
  }

  function createTestDrive() {
    const drive = createDriveDocument();
    drive.state.global.nodes = new Array(10).fill(0).map((_, i) => ({
      id: `node-${i}`,
      name: `Node ${i}`,
      kind: "FILE",
      parentFolder: null,
    }));
    return drive;
  }

  const testDocSize = sizeof(createTestDocument());

  it("should evict older documents when size limit is reached", async ({
    expect,
  }) => {
    // Create a small LRU cache with size for a single document
    const cache = new InMemoryCache(
      new LRUCacheStorage({ maxSize: testDocSize }),
    );
    const doc = createTestDocument();

    await cache.setDocument(`doc-1`, doc);
    await cache.setDocument(`doc-2`, doc);

    // The earliest documents should have been evicted
    const firstDoc = await cache.getDocument("doc-1");
    const lastDoc = await cache.getDocument("doc-2");

    expect(firstDoc).toBeUndefined(); // Should be evicted
    expect(lastDoc).toBeDefined(); // Should still be in cache
  });

  it("should keep most recently accessed documents in cache", async ({
    expect,
  }) => {
    // Create cache that can hold 2 documents
    const cache = new InMemoryCache(
      new LRUCacheStorage({ maxSize: testDocSize * 2 }),
    );
    const doc = createTestDocument();

    // Add 3 documents
    await cache.setDocument(`doc-1`, doc);
    await cache.setDocument(`doc-2`, doc);

    // Access doc-1 to make it most recently used
    await cache.getDocument(`doc-1`);

    // Add doc-3 which should evict doc-2 since doc-1 was recently accessed
    await cache.setDocument(`doc-3`, doc);

    const doc1 = await cache.getDocument("doc-1");
    const doc2 = await cache.getDocument("doc-2");
    const doc3 = await cache.getDocument("doc-3");

    expect(doc1).toBeDefined(); // Should remain as it was most recently accessed
    expect(doc2).toBeUndefined(); // Should be evicted
    expect(doc3).toBeDefined(); // Should be present as it was just added
  });

  it("should handle document updates without unnecessary eviction", async ({
    expect,
  }) => {
    // Create cache that can hold 2 documents
    const cache = new InMemoryCache(
      new LRUCacheStorage({ maxSize: testDocSize * 2 }),
    );
    const doc = createTestDocument();

    // Add 2 documents filling the cache
    await cache.setDocument(`doc-1`, doc);
    await cache.setDocument(`doc-2`, doc);

    // Update doc-1 with similar sized content
    const updatedDoc = JSON.parse(JSON.stringify(doc));
    updatedDoc.state.global.description = "y".repeat(100);
    await cache.setDocument(`doc-1`, updatedDoc);

    const doc1 = await cache.getDocument("doc-1");
    const doc2 = await cache.getDocument("doc-2");

    expect(doc1).toBeDefined();
    expect((doc1?.state.global as DocumentModelState).description).toBe(
      "y".repeat(100),
    );
    expect(doc2).toBeDefined(); // Should not be evicted as cache size wasn't exceeded
  });

  it("should maintain size limit with different sized documents", async ({
    expect,
  }) => {
    const smallDoc = createTestDocument();
    const largeDoc = createTestDrive(); // Drive documents are typically larger
    const totalSize = sizeof(smallDoc) + sizeof(largeDoc);

    // Create cache that can hold two documents of different sizes
    const cache = new InMemoryCache(
      new LRUCacheStorage({ maxSize: totalSize }),
    );

    await cache.setDocument(`small-doc`, smallDoc);
    await cache.setDocument(`large-doc`, largeDoc);

    // Adding another document should evict the first (least recently used)
    await cache.setDocument(`doc-3`, smallDoc);

    const smallDocRetrieved = await cache.getDocument("small-doc");
    const largeDocRetrieved = await cache.getDocument("large-doc");
    const doc3Retrieved = await cache.getDocument("doc-3");

    expect(smallDocRetrieved).toBeUndefined(); // Should be evicted (least recently used)
    expect(largeDocRetrieved).toBeDefined(); // Should be present
    expect(doc3Retrieved).toBeDefined(); // Should be present
  });
});
