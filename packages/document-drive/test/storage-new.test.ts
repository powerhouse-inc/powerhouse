import { DocumentNotFoundError } from "#server/error";
import { existsSync, rmSync } from "fs";
import { createHelia } from "helia";
import path from "path";
import { describe, it } from "vitest";
import {
  createDocument,
  DocumentModelModule,
} from "../../document-model/index";
import { documentModelDocumentModelModule } from "../../document-model/src/document-model/module";
import InMemoryCache from "../src/cache/memory";
import { DocumentDriveDocument } from "../src/drive-document-model/gen/types";
import { createDocument as createDriveDocument } from "../src/drive-document-model/gen/utils";
import { driveDocumentModelModule } from "../src/drive-document-model/module";
import { BrowserStorage } from "../src/storage/browser";
import { FilesystemStorage } from "../src/storage/filesystem";
import { IPFSStorage } from "../src/storage/ipfs";
import { MemoryStorage } from "../src/storage/memory";
import { PrismaClient } from "../src/storage/prisma/client";
import { PrismaStorage } from "../src/storage/prisma/prisma";
import { IDocumentStorage } from "../src/storage/types";

const PG_URL = process.env.PG_URL || "postgresql://localhost:5432/postgres";

const documentModels = [
  documentModelDocumentModelModule,
  driveDocumentModelModule,
] as DocumentModelModule[];

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

    const result = await storage.exists("test");
    expect(result).toBe(false);
  });

  it("should allow creating a document", async ({ expect }) => {
    const storage = await buildStorage();

    const document = createDocument();
    await storage.create("test", document);

    const result = await storage.exists("test");
    expect(result).toBe(true);
  });

  it("should allow getting a document", async ({ expect }) => {
    const storage = await buildStorage();

    const document = createDocument();
    await storage.create("test", document);

    const result = await storage.get("test");

    // Storage implementations are free to return documents with or without populated state + meta.
    // Prisma storage always returns an undefined state, but other storage
    // implementations return the state. The storage layers have always been
    // tested through the drive server, and the drive server (base-server.ts)
    // replays the operations to get the state, if it doesn't exist.
    //
    // Also: we give storage implementations authority to set the created timestamp (like a postgres timestamp).
    // So we compare every field except for state, created, and meta.
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

    try {
      await storage.get("test");

      throw new Error("Document should not be found");
    } catch (e) {
      expect((e as DocumentNotFoundError).documentId).toBe("test");
    }
  });

  it("should throw a DocumentNotFoundError if the document is not found by slug", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    try {
      await storage.getBySlug("test");

      throw new Error("Document should not be found");
    } catch (e) {
      expect((e as DocumentNotFoundError).documentId).toBe("test");
    }
  });

  it("should allow deleting a document", async ({ expect }) => {
    const storage = await buildStorage();

    const document = createDocument();
    await storage.create("test", document);

    const result = await storage.delete("test");
    expect(result).toBe(true);

    const result2 = await storage.exists("test");
    expect(result2).toBe(false);

    const result3 = await storage.delete("test");
    expect(result3).toBe(false);
  });

  it("should delete documents from all drives when deleted", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const document = createDocument();
    await storage.create("test", document);

    const driveA = createDriveDocument();
    await storage.create("driveA", driveA);
    await storage.addChild("driveA", "test");

    const driveB = createDriveDocument();
    await storage.create("driveB", driveB);
    await storage.addChild("driveB", "test");

    const result = await storage.delete("test");
    expect(result).toBe(true);

    const childrenA = await storage.getChildren("driveA");
    expect(childrenA).toEqual([]);

    const childrenB = await storage.getChildren("driveB");
    expect(childrenB).toEqual([]);
  });

  it("should allow creating and retrieving a document with a slug", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const document = createDriveDocument();
    document.initialState.state.global.slug = "test";
    await storage.create("test", document);

    const result = await storage.getBySlug<DocumentDriveDocument>("test");
    expect(result.initialState.state.global.slug).toBe("test");
  });

  it("should allow associating a document with another document", async ({
    expect,
  }) => {
    const storage = await buildStorage();
    const driveId = "drive";
    const documentId = "document";

    // for now, we only allow documents to be associated with drives
    const drive = createDriveDocument();
    await storage.create(driveId, drive);

    const document = createDocument();
    await storage.create(documentId, document);

    await storage.addChild(driveId, documentId);

    const children = await storage.getChildren(driveId);
    expect(children).toEqual([documentId]);
  });

  it("should not allow self associations", async ({ expect }) => {
    const storage = await buildStorage();

    const document = createDocument();
    await storage.create("test", document);

    await expect(storage.addChild("test", "test")).rejects.toThrow();
  });

  it("should not allow circular associations", async ({ expect }) => {
    const storage = await buildStorage();

    const drive = createDriveDocument();
    await storage.create("drive", drive);

    const document = createDocument();
    await storage.create("document", document);

    await storage.addChild("drive", "document");

    await expect(storage.addChild("document", "drive")).rejects.toThrow();
  });

  it("should allow removing a child from a drive", async ({ expect }) => {
    const storage = await buildStorage();

    const drive = createDriveDocument();
    await storage.create("drive", drive);

    const document = createDocument();
    await storage.create("document", document);

    await storage.addChild("drive", "document");

    const result = await storage.removeChild("drive", "document");
    expect(result).toBe(true);

    const children = await storage.getChildren("drive");
    expect(children).toEqual([]);
  });

  it("should not allow removing a child from a non-existent drive", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const result = await storage.removeChild("drive", "document");
    expect(result).toBe(false);
  });

  it("should not allow removing a non-existent child from a drive", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const drive = createDriveDocument();
    await storage.create("drive", drive);

    const result = await storage.removeChild("drive", "document");
    expect(result).toBe(false);
  });

  it("should not allow removing a non-existent child from a non-existent drive", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const result = await storage.removeChild("drive", "document");
    expect(result).toBe(false);
  });

  it("parent/child relationship should be removed when the child is deleted", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const drive = createDriveDocument();
    await storage.create("drive", drive);

    const document = createDocument();
    await storage.create("document", document);

    await storage.addChild("drive", "document");

    await storage.delete("document");

    const children = await storage.getChildren("drive");
    expect(children).toEqual([]);
  });

  it("parent/child relationship should be removed when the parent is deleted", async ({
    expect,
  }) => {
    const storage = await buildStorage();

    const drive = createDriveDocument();
    await storage.create("drive", drive);

    const document = createDocument();
    await storage.create("document", document);

    await storage.addChild("drive", "document");

    await storage.delete("drive");

    const children = await storage.getChildren("drive");
    expect(children).toEqual([]);
  });
});
