import {
  API,
  IProcessorManager,
  isProcessorClass,
  startAPI,
  SubgraphManager,
} from "@powerhousedao/reactor-api";
import { isSubgraphClass, SubgraphClass } from "@powerhousedao/reactor-api";
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
import { access } from "node:fs/promises";
import { createServer as createViteServer, ViteDevServer } from "vite";

type FSError = {
  errno: number;
  code: string;
  syscall: string;
  path: string;
};

const dirname = process.cwd();

dotenv.config();

type Packages = {
  packageName: string;
}[];

export type StartServerOptions = {
  dev?: boolean;
  port?: string | number;
  storagePath?: string;
  dbPath?: string;
  drive?: DriveInput;
  packages?: Packages;
};

export const DefaultStartServerOptions = {
  port: 4001,
  storagePath: path.join(dirname, ".ph/file-storage"),
  dbPath: path.join(dirname, ".ph/read-model.db"),
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
  process.setMaxListeners(0);
  const { port, storagePath, drive, dev, dbPath, packages } = {
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

  if (packages?.length) {
    try {
      const documentModels = await loadPackages(packages);
      driveServer.setDocumentModels(
        joinDocumentModels(driveServer.getDocumentModels(), documentModels),
      );
    } catch (e) {
      console.error("Error loading packages", e);
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

async function startDevMode(api: API, driveServer: IDocumentDriveServer) {
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

  // load local subgraphs
  const subgraphsPath = path.join(process.cwd(), "./subgraphs"); // TODO get path from powerhouse config
  await loadSubgraphs(subgraphsPath, vite, api.subgraphManager);

  /**
   * TODO: watch code changes on processors and document models
   */
}

async function loadPackages(packages: Packages) {
  const loadedPackages: DocumentModel[] = [];
  for (const pkg of packages) {
    try {
      console.log("> Loading package", pkg.packageName);
      const pkgModule = (await import(
        `${pkg.packageName}/document-models`
      )) as unknown as { [key: string]: DocumentModel } | undefined;
      if (pkgModule) {
        console.log(`  ➜  Loaded package: ${pkg.packageName}`);
        loadedPackages.push(...Object.values(pkgModule));
      } else {
        console.warn(`  ➜  No package found: ${pkg.packageName}`);
      }
    } catch (e) {
      console.error("Error loading package", pkg.packageName, e);
    }
  }
  return loadedPackages;
}

async function loadDocumentModels(
  path: string,
  vite: ViteDevServer,
  driveServer: IDocumentDriveServer,
) {
  try {
    console.log("> Loading document models from", path);
    await access(path);
    const localDMs = (await vite.ssrLoadModule(path)) as Record<
      string,
      DocumentModel
    >;
    const localDocumentModels = Object.values(localDMs);
    driveServer.setDocumentModels(
      joinDocumentModels(driveServer.getDocumentModels(), localDocumentModels),
    );
  } catch (e) {
    if ((e as FSError).code === "ENOENT") {
      console.warn("No local document models found");
    } else {
      console.error("Error loading document models", e);
    }
  }
}

async function loadProcessors(
  path: string,
  vite: ViteDevServer,
  processorManager: IProcessorManager,
) {
  try {
    console.log("> Loading processors from", path);
    await access(path);
    const localProcessors = await vite.ssrLoadModule(path);
    for (const [name, processor] of Object.entries(localProcessors)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const ProcessorClass = processor[name];
      if (isProcessorClass(ProcessorClass)) {
        await processorManager.registerProcessor(ProcessorClass);
      }
    }
  } catch (e) {
    if ((e as FSError).code === "ENOENT") {
      console.warn("No local document models found");
    } else {
      console.error("Error loading processors", e);
    }
  }
}

async function loadSubgraphs(
  path: string,
  vite: ViteDevServer,
  subgraphManager: SubgraphManager,
) {
  try {
    console.log("> Loading subgraphs from", path);
    await access(path);
    const localSubgraphs = await vite.ssrLoadModule(path);
    for (const [name, subgraph] of Object.entries(localSubgraphs)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const SubgraphClass = subgraph[name] as SubgraphClass;
      if (isSubgraphClass(SubgraphClass)) {
        await subgraphManager.registerSubgraph(SubgraphClass);
      }
    }
  } catch (e) {
    if ((e as FSError).code === "ENOENT") {
      console.warn("No local document models found");
    } else {
      console.error("Error loading subgraphs", e);
    }
  }
}

function joinDocumentModels(...documentModels: DocumentModel[][]) {
  return documentModels
    .flat()
    .toReversed()
    .reduce<DocumentModel[]>(
      (acc, curr) =>
        acc.find((dm) => dm.documentModel.id === curr.documentModel.id)
          ? acc
          : [...acc, curr],
      [],
    );
}

export { startServer };
