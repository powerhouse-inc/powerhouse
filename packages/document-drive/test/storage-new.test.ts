import { PrismaClient } from "@prisma/client";
import { existsSync, rmSync } from "fs";
import { createHelia } from "helia";
import path from "path";
import { describe, it } from "vitest";
import {
  createDocument,
  DocumentModelModule,
} from "../../document-model/index";
import { documentModelDocumentModelModule } from "../../document-model/src/document-model/module";
import { driveDocumentModelModule } from "../src/drive-document-model/module";
import { BrowserStorage } from "../src/storage/browser";
import { FilesystemStorage } from "../src/storage/filesystem";
import { IPFSStorage } from "../src/storage/ipfs";
import { MemoryStorage } from "../src/storage/memory";
import { PrismaStorage } from "../src/storage/prisma";
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
  /*[
    "Sequelize Storage",
    async () => {
      const storage = new SequelizeStorage({
        dialect: "sqlite",
        storage: ":memory:",
        logging: false,
      });
      await storage.syncModels();
      return storage;
    },
  ],*/
  ["Browser Storage", () => Promise.resolve(new BrowserStorage())],
  [
    "PrismaStorage",
    async () => {
      const prisma = new PrismaClient();
      await prisma.$executeRawUnsafe('DELETE FROM "Attachment";');
      await prisma.$executeRawUnsafe('DELETE FROM "Operation";');
      await prisma.$executeRawUnsafe('DELETE FROM "Document";');
      await prisma.$executeRawUnsafe('DELETE FROM "DriveDocument";');
      await prisma.$executeRawUnsafe('DELETE FROM "Drive";');

      return new PrismaStorage(prisma);
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
    expect(result).toEqual(document);
  });
});
