import { PGlite } from "@electric-sql/pglite";
import { startAPI } from "@powerhousedao/reactor-api";
import {
  DocumentDriveServer,
  DriveAlreadyExistsError,
  DriveInput,
  InternalTransmitter,
  IReceiver,
} from "document-drive";
import { FilesystemStorage } from "document-drive/storage/filesystem";
import {
  DocumentDriveDocument,
  ListenerFilter,
} from "document-model-libs/document-drive";
import * as DocumentModelsLibs from "document-model-libs/document-models";
import { DocumentModel } from "document-model/document";
import { module as DocumentModelLib } from "document-model/document-model";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

const dirname =
  import.meta.dirname || path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

export type StartServerOptions = {
  dev?: boolean;
  port?: string | number;
  storagePath?: string;
  dbPath?: string;
  drive?: DriveInput;
};

export const DefaultStartServerOptions = {
  port: 4001,
  storagePath: path.join(dirname, "./file-storage"),
  dbPath: path.join(dirname, "./dev.db"),
  drive: {
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
  },
} satisfies StartServerOptions;

export type LocalReactor = {
  driveUrl: string;
  getDocumentPath: (driveId: string, documentId: string) => string;
  addListener: (
    driveId: string,
    receiver: IReceiver,
    options: {
      listenerId: string;
      label: string;
      block: boolean;
      filter: ListenerFilter;
    },
  ) => Promise<InternalTransmitter>;
};

const baseDocumentModels = [
  DocumentModelLib,
  ...Object.values(DocumentModelsLibs),
] as DocumentModel[];

const startServer = async (
  options?: StartServerOptions,
): Promise<LocalReactor> => {
  const { port, storagePath, drive, dev } = {
    ...DefaultStartServerOptions,
    ...options,
  };
  const serverPort = Number(process.env.PORT ?? port);

  // start document drive server with all available document models & filesystem storage
  const driveServer = new DocumentDriveServer(
    baseDocumentModels,
    new FilesystemStorage(storagePath),
  );

  // init drive server
  await driveServer.initialize();

  let driveId = drive.global.slug ?? drive.global.id;
  let driveUrl = "";
  try {
    // add default drive
    const driveDoc = await driveServer.addDrive(drive);
    driveId = driveDoc.state.global.slug ?? driveDoc.state.global.id;
  } catch (e) {
    if (e instanceof DriveAlreadyExistsError) {
      console.info("Default drive already exists. Skipping...");
      if (driveId) {
        const driveDoc = await (drive.global.slug
          ? driveServer.getDriveBySlug(drive.global.slug)
          : driveServer.getDrive(driveId));
        driveId = driveDoc.state.global.slug ?? driveDoc.state.global.id;
      }
    } else {
      throw e;
    }
  }

  try {
    // start api
    const client = new PGlite(options?.dbPath ?? process.cwd() + "/dev.db");

    const { app, reactorRouterManager } = await startAPI(driveServer, {
      port: serverPort,
      client,
    });
    driveUrl = `http://localhost:${serverPort}/${driveId ? `d/${drive.global.slug ?? drive.global.id}` : ""}`;
    console.log(`  ➜  Reactor:   ${driveUrl}`);

    if (dev) {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "custom",
        build: {
          rollupOptions: {
            input: [],
          },
        },
      });
      app.use(vite.middlewares);

      const documentModelsPath = path.join(process.cwd(), "./document-models");
      console.log("Loading document models from", documentModelsPath);
      const localDMs = (await vite.ssrLoadModule(documentModelsPath)) as Record<
        string,
        DocumentModel
      >;
      driveServer.setDocumentModels([
        ...baseDocumentModels,
        ...Object.values(localDMs),
      ]);

      // load processors
      const processorsPath = path.join(process.cwd(), "./processors");
      console.log("Loading processors from", processorsPath);
      const localProcessors = await vite.ssrLoadModule(processorsPath);

      for (const [name, processor] of Object.entries(localProcessors)) {
        await reactorRouterManager.registerProcessor({
          ...processor,
        });
      }
    }
  } catch (e) {
    console.error("App crashed", e);
  }

  return {
    driveUrl,
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
