import {
  isProcessorClass,
  API,
  startAPI,
  IProcessorManager,
} from "@powerhousedao/reactor-api";
import {
  DocumentDriveServer,
  DriveAlreadyExistsError,
  DriveInput,
  IDocumentDriveServer,
  InternalTransmitter,
  IReceiver,
} from "document-drive";
import { FilesystemStorage } from "document-drive/storage/filesystem";
import { ListenerFilter } from "document-model-libs/document-drive";
import * as DocumentModelsLibs from "document-model-libs/document-models";
import { DocumentModel } from "document-model/document";
import { module as DocumentModelLib } from "document-model/document-model";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer, ViteDevServer } from "vite";

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
  dbPath: undefined,
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
  const { port, storagePath, drive, dev, dbPath } = {
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
    const api = await startAPI(driveServer, {
      port: serverPort,
      dbPath,
    });
    driveUrl = `http://localhost:${serverPort}/${driveId ? `d/${drive.global.slug ?? drive.global.id}` : ""}`;
    console.log(`  ➜  Reactor:   ${driveUrl}`);

    if (dev) {
      await startDevMode(api, driveServer);
    }
  } catch (e) {
    console.error("Error starting API", e);
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

const startDevMode = async (api: API, driveServer: IDocumentDriveServer) => {
  const vite = await createViteServer({
    server: { middlewareMode: true, watch: null },
    appType: "custom",
    build: {
      rollupOptions: {
        input: [],
      },
    },
  });
  api.app.use(vite.middlewares);

  // load local document models
  const documentModelsPath = path.join(process.cwd(), "./document-models"); // TODO get path from powerhouse config
  await loadDocumentModels(documentModelsPath, vite, driveServer);

  // load local processors
  const processorsPath = path.join(process.cwd(), "./processors"); // TODO get path from powerhouse config
  await loadProcessors(processorsPath, vite, api.processorManager);

  /**
   * TODO: watch code changes on processors and document models
   */
};

async function loadDocumentModels(
  path: string,
  vite: ViteDevServer,
  driveServer: IDocumentDriveServer,
) {
  console.log("Loading document models from", path);
  const localDMs = (await vite.ssrLoadModule(path)) as Record<
    string,
    DocumentModel
  >;
  driveServer.setDocumentModels([
    ...baseDocumentModels,
    ...Object.values(localDMs),
  ]);
}

async function loadProcessors(
  path: string,
  vite: ViteDevServer,
  processorManager: IProcessorManager,
) {
  console.log("Loading processors from", path);
  const localProcessors = await vite.ssrLoadModule(path);
  for (const [name, processor] of Object.entries(localProcessors)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const ProcessorClass = processor[name];
    if (isProcessorClass(ProcessorClass)) {
      await processorManager.registerProcessor(ProcessorClass);
    }
  }
}

export { startServer };
