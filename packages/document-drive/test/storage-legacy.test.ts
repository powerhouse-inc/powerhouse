import { PrismaClient } from "@prisma/client";
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
import { MemoryStorage } from "../src/storage/memory";
import { PrismaStorage } from "../src/storage/prisma";
import { SequelizeStorage } from "../src/storage/sequelize";
import { IStorage } from "../src/storage/types";

const PG_URL = process.env.PG_URL || "postgresql://localhost:5444/postgres";

const documentModels = [
  documentModelDocumentModelModule,
  driveDocumentModelModule,
] as DocumentModelModule[];

const storageImplementations: [string, () => Promise<IStorage>][] = [
  ["Memory Storage", () => Promise.resolve(new MemoryStorage())],
  [
    "File System Storage",
    () =>
      Promise.resolve(
        new FilesystemStorage(path.join(__dirname, "test-storage")),
      ),
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
  ["PrismaStorage", async () => new PrismaStorage(new PrismaClient())],
] as unknown as [string, () => Promise<IStorage>][];

describe.each(storageImplementations)("%s", async (_, buildStorage) => {
  it("should correctly check for non-existent document", async ({ expect }) => {
    const storage = await buildStorage();

    const result = await storage.checkDocumentExists("test", "test");
    expect(result).toBe(false);
  });

  it("should correctly check for existent document", async ({ expect }) => {
    const storage = await buildStorage();

    await storage.createDocument("foo", "bar", createDocument());

    const result = await storage.checkDocumentExists("foo", "bar");
    expect(result).toBe(true);
  });
});
