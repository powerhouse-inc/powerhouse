import { createClient } from "redis";
import { beforeEach, describe, it } from "vitest";
import {
  createDocument as createDocumentModelDocument,
  DocumentModelModule,
} from "../../document-model/index";
import { documentModelDocumentModelModule } from "../../document-model/src/document-model/module";
import InMemoryCache from "../src/cache/memory";
import RedisCache from "../src/cache/redis";
import { ICache } from "../src/cache/types";
import { createDocument as createDriveDocument } from "../src/drive-document-model/gen/utils";
import { driveDocumentModelModule } from "../src/drive-document-model/module";

// Set up document models for testing
const documentModels = [
  documentModelDocumentModelModule,
  driveDocumentModelModule,
] as DocumentModelModule[];

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
    "RedisCache",
    async () => {
      const client = await initRedis();

      // Clear the test keys
      await client.flushDb();

      // Use type assertion to handle Redis client type compatibility
      return new RedisCache(client as any);
    },
  ],
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
      expect(retrievedDocument?.documentType).toBe(document.documentType);
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
      expect(retrievedDrive?.documentType).toBe(drive.documentType);
    });

    it("should return undefined when getting a non-existent drive", async ({
      expect,
    }) => {
      const driveId = "non-existent-drive";

      const retrievedDrive = await cache.getDrive(driveId);

      expect(retrievedDrive).toBeUndefined();
    });

    it("should delete a drive", async ({ expect }) => {
      const driveId = "drive-to-delete";
      const drive = createDriveDocument();

      // Set custom id so we can test the slug deletion logic
      drive.state.global.id = driveId;
      drive.state.global.slug = "test-slug";

      await cache.setDrive(driveId, drive);
      const deletionResult = await cache.deleteDrive(driveId);
      const retrievedDrive = await cache.getDrive(driveId);

      expect(deletionResult).toBe(true);
      expect(retrievedDrive).toBeUndefined();
    });

    it("should return false when deleting a non-existent drive", async ({
      expect,
    }) => {
      const driveId = "non-existent-drive";

      const deletionResult = await cache.deleteDrive(driveId);

      expect(deletionResult).toBe(false);
    });
  });

  // Drive by slug tests
  describe("drive by slug operations", () => {
    it("should set and get a drive by slug", async ({ expect }) => {
      const slug = "test-slug";
      const drive = createDriveDocument();
      const driveId = "test-drive-id";

      // Set drive ID for consistency
      drive.state.global.id = driveId;
      drive.state.global.slug = slug;

      await cache.setDriveBySlug(slug, drive);
      const retrievedDrive = await cache.getDriveBySlug(slug);

      expect(retrievedDrive).toBeDefined();
      expect(retrievedDrive?.state.global.id).toBe(driveId);
      expect(retrievedDrive?.state.global.slug).toBe(slug);
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
      const driveId = "drive-to-delete";
      const drive = createDriveDocument();

      // Set custom id and slug for testing
      drive.state.global.id = driveId;
      drive.state.global.slug = slug;

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
      const driveId = "test-drive-id";
      const drive = createDriveDocument();

      // Set drive ID and slug for consistency
      drive.state.global.id = driveId;
      drive.state.global.slug = slug;

      await cache.setDriveBySlug(slug, drive);

      const retrievedDriveBySlug = await cache.getDriveBySlug(slug);
      const retrievedDriveById = await cache.getDrive(driveId);

      expect(retrievedDriveBySlug).toBeDefined();
      expect(retrievedDriveById).toBeDefined();
      expect(retrievedDriveById?.state.global.id).toBe(driveId);
      expect(retrievedDriveById?.state.global.slug).toBe(slug);
      expect(retrievedDriveBySlug?.state.global.id).toBe(
        retrievedDriveById?.state.global.id,
      );
    });

    it("should make drive inaccessible by slug after deleting by ID", async ({
      expect,
    }) => {
      const slug = "test-slug";
      const driveId = "test-drive-id";
      const drive = createDriveDocument();

      // Set drive ID and slug for consistency
      drive.state.global.id = driveId;
      drive.state.global.slug = slug;

      await cache.setDriveBySlug(slug, drive);
      await cache.deleteDrive(driveId);

      const retrievedDriveBySlug = await cache.getDriveBySlug(slug);

      expect(retrievedDriveBySlug).toBeUndefined();
    });
  });
});
