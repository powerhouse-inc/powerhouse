import {
  DocumentAlreadyExistsError,
  logger,
  MemoryStorage,
} from "document-drive";

import { viteCommonjs } from "@originjs/vite-plugin-commonjs";
import { DriveInput, IDocumentDriveServer } from "document-drive";
import { ICache } from "document-drive/cache/types";
import { BrowserStorage } from "document-drive/storage/browser";
import { FilesystemStorage } from "document-drive/storage/filesystem";
import { PrismaStorageFactory } from "document-drive/storage/prisma/factory";
import { IDriveOperationStorage } from "document-drive/storage/types";
import { createServer } from "vite";
import { StorageOptions } from "./types.js";

export const createStorage = (
  options: StorageOptions,
  cache: ICache,
): IDriveOperationStorage => {
  switch (options.type) {
    case "filesystem":
      logger.info(
        `Initializing filesystem storage at '${options.filesystemPath}'.`,
      );
      return new FilesystemStorage(options.filesystemPath!);
    case "postgres": {
      if (!options.postgresUrl) {
        throw new Error("Postgres url is required");
      }

      logger.info(`Initializing postgres storage at '${options.postgresUrl}'.`);
      const storageFactory = new PrismaStorageFactory(
        options.postgresUrl,
        cache,
      );
      const storage = storageFactory.build();
      return storage;
    }
    case "browser":
      logger.info("Initializing browser storage.");
      return new BrowserStorage();
    default:
      logger.info("Initializing memory storage.");
      return new MemoryStorage();
  }
};

export async function addDefaultDrive(
  driveServer: IDocumentDriveServer,
  drive: DriveInput,
  serverPort: number,
) {
  let driveId =
    drive.slug && drive.slug.length > 0 ? drive.slug : drive.global.id;
  try {
    // add default drive
    await driveServer.addDrive(drive);
  } catch (e) {
    if (!(e instanceof DocumentAlreadyExistsError)) {
      throw e;
    }
  }

  return `http://localhost:${serverPort}/d/${driveId}`;
}

export async function startViteServer() {
  const vite = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: "custom",
    build: {
      rollupOptions: {
        input: [],
      },
    },
    plugins: [viteCommonjs()],
  });

  return vite;
}
