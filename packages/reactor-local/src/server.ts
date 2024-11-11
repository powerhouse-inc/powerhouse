import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { startAPI } from "@powerhousedao/reactor-api";
import {
  DocumentDriveServer,
  DriveAlreadyExistsError,
  DriveInput,
  IReceiver,
} from "document-drive";
import { FilesystemStorage } from "document-drive/storage/filesystem";
import * as DocumentModelsLibs from "document-model-libs/document-models";
import { DocumentModel } from "document-model/document";
import { module as DocumentModelLib } from "document-model/document-model";
import { ListenerFilter } from "document-model-libs/document-drive";

const dirname =
  import.meta.dirname || path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

export type StartServerOptions = {
  connect?: {
    port?: string | number;
  };
  reactor?: {
    storagePath?: string;
    drive?: DriveInput;
  };
};

const startServer = async (options?: StartServerOptions) => {
  const serverPort = Number(options?.connect?.port ?? process.env.PORT ?? 4001);
  const storagePath =
    options?.reactor?.storagePath ?? path.join(dirname, "./file-storage");
  const drive = options?.reactor?.drive ?? {
    global: {
      id: "powerhouse",
      name: "Powerhouse",
      icon: "https://ipfs.io/ipfs/QmcaTDBYn8X2psGaXe7iQ6qd8q6oqHLgxvMX9yXf7f9uP7",
      slug: "powerhouse",
    },
    local: {
      availableOffline: true,
      listeners: [],
      sharingType: "public",
      triggers: [],
    },
  };
  // start document drive server with all available document models & filesystem storage
  const driveServer = new DocumentDriveServer(
    [DocumentModelLib, ...Object.values(DocumentModelsLibs)] as DocumentModel[],
    new FilesystemStorage(storagePath),
  );

  // init drive server
  await driveServer.initialize();

  try {
    // add default drive
    await driveServer.addDrive(drive);
  } catch (e) {
    if (e instanceof DriveAlreadyExistsError) {
      console.info("Default drive already exists. Skipping...");
    } else {
      throw e;
    }
  }

  try {
    // start api
    await startAPI(driveServer, {
      port: serverPort,
    });
  } catch (e) {
    console.error("App crashed", e);
  }

  return {
    getDocumentPath: (driveId: string, documentId: string): string => {
      return path.join(storagePath, driveId, `${documentId}.json`);
    },
    addListener: (
      driveId: string,
      receiver: IReceiver,
      options: {
        listenerId: string;
        label: string;
        block: boolean;
        filter: ListenerFilter;
      },
    ) => driveServer.addInternalListener(driveId, receiver, options),
  };
};

export { startServer };
