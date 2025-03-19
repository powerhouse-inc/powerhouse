import { PrismaClient } from "@prisma/client";
import { existsSync, rmdirSync } from "fs";
import path from "path";
import { describe, it } from "vitest";
import { createDocument as createDriveDocument } from "../../document-drive/src/drive-document-model/gen/utils";
import {
  createDocument,
  DocumentModelModule,
} from "../../document-model/index";
import { documentModelDocumentModelModule } from "../../document-model/src/document-model/module";
import { driveDocumentModelModule } from "../src/drive-document-model/module";
import { BrowserStorage } from "../src/storage/browser";
import { FilesystemStorage } from "../src/storage/filesystem";
import { MemoryStorage } from "../src/storage/memory";
import { PrismaStorage } from "../src/storage/prisma";
import { SequelizeStorage } from "../src/storage/sequelize";
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
  [
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
  ],
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
] as unknown as [string, () => Promise<IStorage & IDriveStorage>][];

describe.each(storageImplementations)("%s", async (_, buildStorage) => {
  it("should correctly check for non-existent document", async ({ expect }) => {
    const storage = await buildStorage();

    const result = await storage.checkDocumentExists("test", "test");
    expect(result).toBe(false);
  });

  it("should correctly check for existent document", async ({ expect }) => {
    const storage = await buildStorage();

    const drive = await storage.createDrive("foo", createDriveDocument());
    await storage.createDocument("foo", "bar", createDocument());

    const result = await storage.checkDocumentExists("foo", "bar");
    expect(result).toBe(true);
  });
});
