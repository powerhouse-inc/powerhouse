import {
  DocumentAlreadyExistsError,
  logger,
  MemoryStorage,
} from "document-drive";

import type {
  DriveInput,
  ICache,
  IDocumentDriveServer,
  IDriveOperationStorage,
} from "document-drive";
import { BrowserStorage } from "document-drive";
import { FilesystemStorage } from "document-drive/storage/filesystem";
import { PrismaStorageFactory } from "document-drive/storage/prisma";
import type { StorageOptions } from "./types.js";

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
  let driveId = drive.id;
  if (!driveId || driveId.length === 0) {
    driveId = drive.slug;
  }

  if (!driveId || driveId.length === 0) {
    throw new Error("Invalid Drive Id");
  }

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
