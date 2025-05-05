import {
  DocumentAlreadyExistsError,
  DocumentNotFoundError,
} from "#server/error";
import { existsSync, rmSync } from "fs";
import { createHelia } from "helia";
import path from "path";
import { describe, it } from "vitest";
import {
  createDocument,
  DocumentModelDocument,
  generateId,
} from "../../document-model/index";
import InMemoryCache from "../src/cache/memory";
import { DocumentDriveDocument } from "../src/drive-document-model/gen/types";
import { createDocument as createDriveDocument } from "../src/drive-document-model/gen/utils";
import { BrowserStorage } from "../src/storage/browser";
import { FilesystemStorage } from "../src/storage/filesystem";
import { IPFSStorage } from "../src/storage/ipfs";
import { MemoryStorage } from "../src/storage/memory";
import { PrismaClient } from "../src/storage/prisma/client";
import { PrismaStorage } from "../src/storage/prisma/prisma";
import { IDocumentStorage } from "../src/storage/types";

const storageImplementations: [string, () => Promise<IDocumentStorage>][] = [
  ["Memory Storage", () => Promise.resolve(new MemoryStorage())],
  [
    "File System Storage",
    () => {
      const basePath = path.join(__dirname, "test-storage");

      // delete the base path
      if (existsSync(basePath)) {
        rmSync(basePath, { recursive: true, force: true });
      }

      return Promise.resolve(new FilesystemStorage(basePath));
    },
  ],
  [
    "Browser Storage",
    async () => {
      const storage = new BrowserStorage();
      await storage.clear();
      return storage;
    },
  ],
  [
    "PrismaStorage",
    async () => {
      const prisma = new PrismaClient();
      await prisma.$executeRawUnsafe('DELETE FROM "Attachment";');
      await prisma.$executeRawUnsafe('DELETE FROM "Operation";');
      await prisma.$executeRawUnsafe('DELETE FROM "Document";');
      await prisma.$executeRawUnsafe('DELETE FROM "DriveDocument";');
      await prisma.$executeRawUnsafe('DELETE FROM "Drive";');

      return new PrismaStorage(prisma, new InMemoryCache());
    },
  ],
  [
    "IPFSStorage",
    async () => {
      const helia = await createHelia();
      return new IPFSStorage(helia);
    },
  ],
] as unknown as [string, () => Promise<IDocumentStorage>][];

describe.each(storageImplementations)("%s", async (_, buildStorage) => {
  it("should correctly check for non-existent document", async ({ expect }) => {
    const storage = await buildStorage();

    const id = generateId();
    const result = await storage.exists(id);
    expect(result).toBe(false);
  });

  it("should allow creating a document", async ({ expect }) => {
    const storage = await buildStorage();

    const document = createDocument();
    const id = document.id;
    await storage.create(document);

    const result = await storage.exists(id);
    expect(result).toBe(true);
  });

  it("should disallow creating a document with an invalid id", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const document = createDocument();
    document.id = "test!\\";

    await expect(async () => await storage.create(document)).rejects.toThrow();
  });

  it("should not change the state of a document to match id", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const document = createDocument();
    const id = document.id;
    document.initialState.state.global.id = "FOOOP";
    await storage.create(document);

    const result = await storage.get<DocumentModelDocument>(id);
    expect(result.initialState.state.global.id).toBe("FOOOP");
  });

  it("should throw a DocumentAlreadyExistsError when creating a document if the document already exists", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const document = createDocument();
    const id = document.id;
    await storage.create(document);

    try {
      await storage.create(document);

      throw new Error("Document should not be created");
    } catch (e) {
      expect((e as DocumentAlreadyExistsError).documentId).toBe(id);
    }
  });

  it("should throw a DocumentAlreadyExistsError when creating a drive with a slug that already exists", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const a = createDriveDocument();
    a.slug = "test";
    const idA = a.id;
    await storage.create(a);

    // different id, but same slug
    const b = createDriveDocument();
    b.slug = "test";
    const idB = b.id;
    try {
      await storage.create(b);

      throw new Error("Document should not be created");
    } catch (e) {
      expect((e as DocumentAlreadyExistsError).documentId).toBe(idB);
    }
  });

  it("should allow getting a document", async ({ expect }) => {
    const storage = await buildStorage();

    const document = createDocument();
    const id = document.id;
    await storage.create(document);

    const result = await storage.get(id);

    // Storage implementations are free to return documents with or without populated state + meta.
    // Prisma storage always returns an undefined state, but other storage
    // implementations return the state. The storage layers have always been
    // tested through the drive server, and the drive server (base-server.ts)
    // replays the operations to get the state, if it doesn't exist.
    //
    // Also: we give storage implementations authority to set the created timestamp (like a postgres timestamp).
    // So we compare every field except for a few...
    const { state, created, meta, ...rest } = document;
    const {
      state: _state,
      created: _created,
      meta: _meta,
      ...restResult
    } = result;
    expect(restResult).toEqual(rest);
  });

  it("should throw a DocumentNotFoundError if the document is not found", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const id = generateId();
    try {
      await storage.get(id);

      throw new Error("Document should not be found");
    } catch (e) {
      expect((e as DocumentNotFoundError).documentId).toBe(id);
    }
  });

  it("should throw a DocumentNotFoundError if the document is not found by slug", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const slug = generateId();
    try {
      await storage.getBySlug(slug);

      throw new Error("Document should not be found");
    } catch (e) {
      expect((e as DocumentNotFoundError).documentId).toBe(slug);
    }
  });

  it("should allow deleting a document", async ({ expect }) => {
    const storage = await buildStorage();

    const document = createDocument();
    const id = document.id;
    await storage.create(document);

    const result = await storage.delete(id);
    expect(result).toBe(true);

    const result2 = await storage.exists(id);
    expect(result2).toBe(false);

    const result3 = await storage.delete(id);
    expect(result3).toBe(false);
  });

  it("should delete documents from all drives when deleted", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const document = createDocument();
    const documentId = document.id;
    await storage.create(document);

    const driveA = createDriveDocument();
    const driveAId = driveA.id;
    await storage.create(driveA);
    await storage.addChild(driveAId, documentId);

    const driveB = createDriveDocument();
    const driveBId = driveB.id;
    await storage.create(driveB);
    await storage.addChild(driveBId, documentId);

    const result = await storage.delete(documentId);
    expect(result).toBe(true);

    const childrenA = await storage.getChildren(driveAId);
    expect(childrenA).toEqual([]);

    const childrenB = await storage.getChildren(driveBId);
    expect(childrenB).toEqual([]);
  });

  it("should allow getting all parents of a document", async ({ expect }) => {
    const storage = await buildStorage();

    const document = createDocument();
    const childId = document.id;
    await storage.create(document);

    let parents = await storage.getParents(childId);
    expect(parents).toEqual([]);

    const driveA = createDriveDocument();
    const driveAId = driveA.id;
    await storage.create(driveA);

    const driveB = createDriveDocument();
    const driveBId = driveB.id;
    await storage.create(driveB);

    await storage.addChild(driveAId, childId);
    await storage.addChild(driveBId, childId);

    parents = await storage.getParents(childId);

    // order doesn't matter
    expect(parents).toEqual(expect.arrayContaining([driveAId, driveBId]));
  });

  it("should update the parents of a document when a parent is deleted", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const document = createDocument();
    const childId = document.id;
    await storage.create(document);

    const driveA = createDriveDocument();
    const driveAId = driveA.id;
    await storage.create(driveA);

    const driveB = createDriveDocument();
    const driveBId = driveB.id;
    await storage.create(driveB);

    await storage.addChild(driveAId, childId);
    await storage.addChild(driveBId, childId);

    await storage.delete(driveAId);

    const parents = await storage.getParents(childId);
    expect(parents).toEqual([driveBId]);
  });

  it("should, when deleting a document, also delete all child documents that were only a child of that document", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const child = createDocument();
    const childId = child.id;
    await storage.create(child);

    const drive = createDriveDocument();
    const driveId = drive.id;
    await storage.create(drive);
    await storage.addChild(driveId, childId);

    await storage.delete(driveId);

    const result = await storage.exists(childId);
    expect(result).toBe(false);
  });

  it("should allow creating and retrieving a document with a slug", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const slug = `test-slug-${generateId()}`;
    const document = createDriveDocument();
    const id = document.id;
    document.slug = slug;
    await storage.create(document);

    const result = await storage.getBySlug<DocumentDriveDocument>(slug);
    expect(result.slug).toBe(slug);
  });

  it("the id should be used as the slug if no slug is provided", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const document = createDriveDocument();
    const id = document.id;
    document.slug = "";
    await storage.create(document);

    const result = await storage.getBySlug<DocumentDriveDocument>(id);
    expect(result).toBeTruthy();
  });

  it("should reject invalid slugs", async ({ expect }) => {
    const storage = await buildStorage();
    const invalidSlugs = [
      "test/slug",
      "test\\slug",
      "test.slug",
      "test slug",
      "test!slug",
      "test@slug",
      "test#slug",
      "test$slug",
      "test%slug",
      "test^slug",
      "test&slug",
      "test*slug",
      "test(slug",
      "test)slug",
      "test+slug",
      "test=slug",
      "test{slug",
      "test}slug",
      "test[slug",
      "test]slug",
      "test:slug",
      "test;slug",
      "test'slug",
      'test"slug',
      "test<slug",
      "test>slug",
      "test,slug",
      "test?slug",
      "test|slug",
      "test~slug",
      "test`slug",
    ];

    for (const invalidSlug of invalidSlugs) {
      const document = createDriveDocument();
      document.slug = invalidSlug;
      await expect(
        async () => await storage.create(document),
      ).rejects.toThrow();
    }

    const validSlugs = [
      "test-slug",
      "test_slug",
      "test123",
      "123test",
      "testSlug",
      "test-slug-123",
      "test_slug_123",
      "test-slug_123",
    ];

    for (const validSlug of validSlugs) {
      const validDocument = createDriveDocument();
      validDocument.slug = validSlug;
      await storage.create(validDocument);

      const result = await storage.getBySlug<DocumentDriveDocument>(validSlug);
      expect(result).toBeTruthy();
      await storage.delete(validSlug);
    }
  });

  it("should return documents with matching document model type", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    // create docs of different types
    const document1 = createDocument();
    const document2 = createDriveDocument();
    const document3 = createDocument();
    const id1 = document1.id;
    const id2 = document2.id;
    const id3 = document3.id;

    await storage.create(document1);
    await storage.create(document2);
    await storage.create(document3);

    const result = await storage.findByType("powerhouse/document-drive");
    expect(result.documents.length).toBe(1);
    expect(result.documents[0]).toBe(id2);

    const result2 = await storage.findByType("powerhouse/document-model");
    expect(result2.documents.length).toBe(2);
    expect(result2.documents).toContain(id1);
    expect(result2.documents).toContain(id3);
  });

  it("should allow paginating documents by type", async ({ expect }) => {
    const storage = await buildStorage();

    // create 10 documents of the same type with generated IDs
    const documentIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const document = createDocument();
      const id = document.id;
      documentIds.push(id);
      await storage.create(document);
    }

    // pull by 2s
    let nextCursor: string | undefined = undefined;
    let documentsPulled = 0;

    // Keep pulling until we get all documents
    while (documentsPulled < 10) {
      const result = await storage.findByType(
        "powerhouse/document-model",
        2,
        nextCursor,
      );

      expect(result.documents.length).toBeGreaterThan(0);
      expect(result.documents.length).toBeLessThanOrEqual(2);

      // Verify that the documents we got are in our created list
      for (const id of result.documents) {
        expect(documentIds.includes(id)).toBe(true);
      }

      documentsPulled += result.documents.length;
      nextCursor = result.nextCursor;

      // Break if no more cursor
      if (!nextCursor) break;
    }

    expect(documentsPulled).toBe(10);
  });

  it("should allow associating a document with another document", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    // for now, we only allow documents to be associated with drives
    const drive = createDriveDocument();
    const driveId = drive.id;
    await storage.create(drive);

    const document = createDocument();
    const documentId = document.id;
    await storage.create(document);

    await storage.addChild(driveId, documentId);

    const children = await storage.getChildren(driveId);
    expect(children).toEqual([documentId]);
  });

  it("should not allow self associations", async ({ expect }) => {
    const storage = await buildStorage();

    const document = createDocument();
    const documentId = document.id;
    await storage.create(document);

    await expect(storage.addChild(documentId, documentId)).rejects.toThrow();
  });

  it("should not allow circular associations", async ({ expect }) => {
    const storage = await buildStorage();

    const drive = createDriveDocument();
    const driveId = drive.id;
    await storage.create(drive);

    const document = createDocument();
    const documentId = document.id;
    await storage.create(document);

    await storage.addChild(driveId, documentId);

    await expect(storage.addChild(documentId, driveId)).rejects.toThrow();
  });

  it("should allow removing a child from a drive", async ({ expect }) => {
    const storage = await buildStorage();

    const drive = createDriveDocument();
    const driveId = drive.id;
    await storage.create(drive);

    const document = createDocument();
    const documentId = document.id;
    await storage.create(document);

    await storage.addChild(driveId, documentId);

    const result = await storage.removeChild(driveId, documentId);
    expect(result).toBe(true);

    const children = await storage.getChildren(driveId);
    expect(children).toEqual([]);
  });

  it("should not allow removing a child from a non-existent drive", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const document = createDocument();
    const documentId = document.id;
    await storage.create(document);

    const driveId = generateId();

    const result = await storage.removeChild(driveId, documentId);
    expect(result).toBe(false);
  });

  it("should not allow removing a non-existent child from a drive", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const documentId = generateId();

    const drive = createDriveDocument();
    const driveId = drive.id;
    await storage.create(drive);

    const result = await storage.removeChild(driveId, documentId);
    expect(result).toBe(false);
  });

  it("should not allow removing a non-existent child from a non-existent drive", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const driveId = generateId();
    const documentId = generateId();

    const result = await storage.removeChild(driveId, documentId);
    expect(result).toBe(false);
  });

  it("parent/child relationship should be removed when the child is deleted", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const drive = createDriveDocument();
    const driveId = drive.id;
    await storage.create(drive);

    const document = createDocument();
    const documentId = document.id;
    await storage.create(document);

    await storage.addChild(driveId, documentId);

    await storage.delete(documentId);

    const children = await storage.getChildren(driveId);
    expect(children).toEqual([]);
  });

  it("parent/child relationship should be removed when the parent is deleted", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const drive = createDriveDocument();
    const driveId = drive.id;
    await storage.create(drive);

    const document = createDocument();
    const documentId = document.id;
    await storage.create(document);

    await storage.addChild(driveId, documentId);

    await storage.delete(driveId);

    const children = await storage.getChildren(driveId);
    expect(children).toEqual([]);
  });
});
