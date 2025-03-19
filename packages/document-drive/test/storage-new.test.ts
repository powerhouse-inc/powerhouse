import path from "path";
import { describe, it } from "vitest";
import { DocumentModelModule } from "../../document-model/index";
import { documentModelDocumentModelModule } from "../../document-model/src/document-model/module";
import { driveDocumentModelModule } from "../src/drive-document-model/module";
import { BrowserStorage } from "../src/storage/browser";
import { FilesystemStorage } from "../src/storage/filesystem";
import { MemoryStorage } from "../src/storage/memory";
import { SequelizeStorage } from "../src/storage/sequelize";
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
] as unknown as [string, () => Promise<IDocumentStorage>][];

describe.each(storageImplementations)("%s", async (_, buildStorage) => {
  it("should correctly check for non-existent document", async ({ expect }) => {
    const storage = await buildStorage();

    const result = await storage.exists("test");
    expect(result).toBe(false);
  });
});
