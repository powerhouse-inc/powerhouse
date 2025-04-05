import { existsSync, rmdirSync } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { DocumentModelModule } from "../../document-model/index";
import { documentModelDocumentModelModule } from "../../document-model/src/document-model/module";
import InMemoryCache from "../src/cache/memory";
import { driveDocumentModelModule } from "../src/drive-document-model/module";
import { BrowserStorage } from "../src/storage/browser";
import { FilesystemStorage } from "../src/storage/filesystem";
import { MemoryStorage } from "../src/storage/memory";
import { PrismaClient } from "../src/storage/prisma/client";
import { PrismaStorage } from "../src/storage/prisma/prisma";
import { IDriveStorage, IStorage } from "../src/storage/types";

const PG_URL = process.env.PG_URL || "postgresql://localhost:5444/postgres";

const documentModels = [
  documentModelDocumentModelModule,
  driveDocumentModelModule,
] as DocumentModelModule[];

const storageImplementations: [
  string,
  () => Promise<IStorage & IDriveStorage>,
][] = [
  ["Memory Storage", () => Promise.resolve(new MemoryStorage())],
  [
    "File System Storage",
    () => {
      const basePath = path.join(__dirname, "test-storage");
      if (existsSync(basePath)) {
        rmdirSync(basePath, { recursive: true });
      }

      return new FilesystemStorage(basePath);
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
] as unknown as [string, () => Promise<IStorage & IDriveStorage>][];

describe.each(storageImplementations)("%s", async (_, buildStorage) => {
  beforeEach(() => {
    try {
      vi.useFakeTimers();
    } catch (e) {
      //
    }
  });

  afterEach(() => {
    try {
      vi.useRealTimers();
    } catch (e) {
      //
    }
  });

  it("should compile", () => {
    //
  });
});
