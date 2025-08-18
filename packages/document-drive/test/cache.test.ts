import sizeof from "object-sizeof";
import { createClient } from "redis";
import { beforeEach, describe, it } from "vitest";
import {
  createDocument as createDocumentModelDocument,
  DocumentModelState,
  generateId,
} from "../../document-model/index.js";
import { LRUCacheStorage } from "../src/cache/lru.js";
import InMemoryCache from "../src/cache/memory.js";
import { ICache } from "../src/cache/types.js";
import { createDocument as createDriveDocument } from "../src/drive-document-model/gen/utils.js";
import { createBaseState } from "./utils.js";

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

  beforeEach(async () => {
    cache = await buildCache();
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

  // Drive tests
  describe("drive operations", () => {
    it("should set and get a drive", async ({ expect }) => {
      const driveId = "test-drive-id";
      const drive = createDriveDocument();

      await cache.setDrive(driveId, drive);
      const retrievedDrive = await cache.getDrive(driveId);

      expect(retrievedDrive).toBeDefined();
      expect(retrievedDrive?.header.documentType).toBe(
        drive.header.documentType,
      );
    });

    it("should return undefined when getting a non-existent drive", async ({
      expect,
    }) => {
      const driveId = "non-existent-drive";

      const retrievedDrive = await cache.getDrive(driveId);

      expect(retrievedDrive).toBeUndefined();
    });

    it("should delete a drive", async ({ expect }) => {
      const drive = createDriveDocument();
      const driveId = drive.header.id;

      // Set slug for slug deletion logic
      drive.header.slug = "test-slug";

      await cache.setDrive(driveId, drive);
      const deletionResult = await cache.deleteDrive(driveId);
      const retrievedDrive = await cache.getDrive(driveId);

      expect(deletionResult).toBe(true);
      expect(retrievedDrive).toBeUndefined();
    });

    it("should return false when deleting a non-existent drive", async ({
      expect,
    }) => {
      const driveId = generateId();

      const deletionResult = await cache.deleteDrive(driveId);

      expect(deletionResult).toBe(false);
    });
  });

  // Drive by slug tests
  describe("drive by slug operations", () => {
    it("should set and get a drive by slug", async ({ expect }) => {
      const slug = "test-slug";
      const drive = createDriveDocument();
      const driveId = drive.header.id;

      drive.header.id = driveId;
      drive.header.slug = slug;

      await cache.setDriveBySlug(slug, drive);
      const retrievedDrive = await cache.getDriveBySlug(slug);

      expect(retrievedDrive).toBeDefined();
      expect(retrievedDrive?.header.id).toBe(driveId);
      expect(retrievedDrive?.header.slug).toBe(slug);
    });

    it("should return undefined when getting a non-existent drive by slug", async ({
      expect,
    }) => {
      const slug = "non-existent-slug";

      const retrievedDrive = await cache.getDriveBySlug(slug);

      expect(retrievedDrive).toBeUndefined();
    });

    it("should delete a drive by slug", async ({ expect }) => {
      const slug = "slug-to-delete";
      const drive = createDriveDocument();
      drive.header.slug = slug;

      await cache.setDriveBySlug(slug, drive);
      const deletionResult = await cache.deleteDriveBySlug(slug);
      const retrievedDrive = await cache.getDriveBySlug(slug);

      expect(deletionResult).toBe(true);
      expect(retrievedDrive).toBeUndefined();
    });

    it("should return false when deleting a non-existent drive by slug", async ({
      expect,
    }) => {
      const slug = "non-existent-slug";

      const deletionResult = await cache.deleteDriveBySlug(slug);

      expect(deletionResult).toBe(false);
    });
  });

  // Cross-referencing tests
  describe("cross-referencing", () => {
    it("should retrieve the same drive via ID after setting by slug", async ({
      expect,
    }) => {
      const slug = "test-slug";
      const drive = createDriveDocument();
      const driveId = drive.header.id;

      // Set slug for consistency
      drive.header.slug = slug;

      await cache.setDriveBySlug(slug, drive);

      const retrievedDriveBySlug = await cache.getDriveBySlug(slug);
      const retrievedDriveById = await cache.getDrive(driveId);

      expect(retrievedDriveBySlug).toBeDefined();
      expect(retrievedDriveById).toBeDefined();
      expect(retrievedDriveById?.header.id).toBe(driveId);
      expect(retrievedDriveById?.header.slug).toBe(slug);
      expect(retrievedDriveBySlug?.header.id).toBe(
        retrievedDriveById?.header.id,
      );
    });

    it("should make drive inaccessible by slug after deleting by ID", async ({
      expect,
    }) => {
      const slug = "test-slug";
      const drive = createDriveDocument();
      const driveId = drive.header.id;

      // Set slug for slug deletion logic
      drive.header.slug = slug;

      await cache.setDriveBySlug(slug, drive);
      await cache.deleteDrive(driveId);

      const retrievedDriveBySlug = await cache.getDriveBySlug(slug);

      expect(retrievedDriveBySlug).toBeUndefined();
    });
  });

  describe("collisions", () => {
    it("(OBSOLETE) should allow document and drives with the same id without colliding", async ({
      expect,
    }) => {
      const documentId = generateId();
      const driveId = documentId;

      const document = createDocumentModelDocument();
      document.header.id = documentId;

      const drive = createDriveDocument();
      drive.header.id = driveId;

      await cache.setDocument(documentId, document);
      await cache.setDrive(driveId, drive);

      const retrievedDocument = await cache.getDocument(documentId);
      const retrievedDrive = await cache.getDrive(driveId);

      expect(retrievedDocument).toBeDefined();
      expect(retrievedDrive).toBeDefined();
      expect(retrievedDocument?.header.documentType).toBe(
        document.header.documentType,
      );
      expect(retrievedDrive?.header.documentType).toBe(
        drive.header.documentType,
      );
    });
  });
});

// Test specifically for LRU cache behavior
describe("LRU Cache Specific Tests", () => {
  // Helper functions for test data
  function createTestDocument() {
    return createDocumentModelDocument(
      createBaseState(
        {
          id: `doc`,
          name: `Document`,
          author: { name: "author", website: "url" },
          description: "x".repeat(100),
          extension: "md",
          specifications: [],
        },
        {},
      ),
    );
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

  it("should maintain size limit with multiple document types", async ({
    expect,
  }) => {
    const doc = createTestDocument();
    const drive = createTestDrive();
    const totalSize = sizeof(doc) + sizeof(drive);

    // Create cache that can hold one document and one drive
    const cache = new InMemoryCache(
      new LRUCacheStorage({ maxSize: totalSize }),
    );

    await cache.setDocument(`doc-1`, doc);
    await cache.setDrive(`drive-1`, drive);

    // Adding another document should evict the first document
    await cache.setDocument(`doc-2`, doc);

    const doc1 = await cache.getDocument("doc-1");
    const doc2 = await cache.getDocument("doc-2");
    const drive1 = await cache.getDrive("drive-1");

    expect(doc1).toBeUndefined(); // Should be evicted
    expect(doc2).toBeDefined(); // Should be present
    expect(drive1).toBeDefined(); // Should be present as it's in a different storage
  });
});
