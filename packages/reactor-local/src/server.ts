import { viteCommonjs } from "@originjs/vite-plugin-commonjs";
import {
  type GraphQLManager,
  isSubgraphClass,
  startAPI,
  type SubgraphClass,
} from "@powerhousedao/reactor-api";
import {
  DriveAlreadyExistsError,
  driveDocumentModelModule,
  type DriveInput,
  type IDocumentDriveServer,
  InMemoryCache,
  logger,
  MemoryStorage,
  ReactorBuilder,
} from "document-drive";
import type { ICache } from "document-drive/cache/types";
import { BrowserStorage } from "document-drive/storage/browser";
import { FilesystemStorage } from "document-drive/storage/filesystem";
import { PrismaStorageFactory } from "document-drive/storage/prisma/factory";
import {
  documentModelDocumentModelModule,
  type DocumentModelModule,
} from "document-model";
import dotenv from "dotenv";
import { access } from "node:fs/promises";
import path from "node:path";
import { createServer as createViteServer, type ViteDevServer } from "vite";

type FSError = {
  errno: number;
  code: string;
  syscall: string;
  path: string;
};

const dirname = process.cwd();

dotenv.config();

export type StorageOptions = {
  type: "filesystem" | "memory" | "postgres" | "browser";
  filesystemPath?: string;
  postgresUrl?: string;
};

export type StartServerOptions = {
  configFile?: string;
  dev?: boolean;
  port?: string | number;
  storage?: StorageOptions;
  dbPath?: string;
  drive?: DriveInput;
  packages?: string[];
  https?:
    | {
        keyPath: string;
        certPath: string;
      }
    | boolean
    | undefined;
  logLevel?: "info" | "warn" | "error" | "debug" | "verbose" | "silent";
};

export const DefaultStartServerOptions = {
  port: 4001,
  storage: {
    type: "filesystem",
    filesystemPath: path.join(dirname, ".ph/file-storage"),
  },
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
  server: IDocumentDriveServer;
};

const baseDocumentModelModules = [
  documentModelDocumentModelModule,
  driveDocumentModelModule,
] as DocumentModelModule[];

const createStorage = (options: StorageOptions, cache: ICache) => {
  switch (options.type) {
    case "filesystem":
      logger.info(
        `Initializing filesystem storage at '${options.filesystemPath}'.`,
      );
      return new FilesystemStorage(options.filesystemPath!);
    case "memory":
      logger.info("Initializing memory storage.");
      return new MemoryStorage();
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
  }
};

const startServer = async (
  options?: StartServerOptions,
): Promise<LocalReactor> => {
  process.setMaxListeners(0);
  const { port, storage, drive, dev, dbPath, packages, configFile, logLevel } =
    {
      ...DefaultStartServerOptions,
      ...options,
    };

  process.env.LOG_LEVEL = logLevel ?? "debug";

  // be aware: this may not log anything if the log level is above info
  logger.info(`Setting log level to ${logLevel}.`);
  const serverPort = Number(process.env.PORT ?? port);

  // If dev load local document models
  let docModels: DocumentModelModule[] = [];
  const vite: ViteDevServer | undefined = dev
    ? await startDevServer()
    : undefined;

  if (vite) {
    const documentModelsPath = path.join(process.cwd(), "./document-models"); // TODO get path from powerhouse config
    docModels = joinDocumentModelModules(
      (await loadDocumentModels(documentModelsPath, vite)) ?? [],
      baseDocumentModelModules,
    );
  }

  // start document drive server with all available document models & storage
  const cache = new InMemoryCache();
  const driveServer = new ReactorBuilder(docModels)
    .withCache(cache)
    .withStorage(createStorage(storage, cache))
    .build();

  // init drive server
  await driveServer.initialize();
  const driveUrl = await addDefaultDrive(driveServer, drive, serverPort);

  // start api
  const packageOptions = packages?.length
    ? { packages }
    : configFile
      ? { configFile }
      : { packages: [] };
  const api = await startAPI(driveServer, {
    port: serverPort,
    dbPath,
    https: options?.https,
    ...packageOptions,
  });

  if (vite) {
    api.app.use(vite.middlewares);

    // load local subgraphs
    const subgraphsPath = path.join(process.cwd(), "./subgraphs"); // TODO get path from powerhouse config
    await loadSubgraphs(subgraphsPath, vite, api.graphqlManager);
  }

  console.log(`  ➜  Reactor:   ${driveUrl}`);

  return {
    driveUrl,
    getDocumentPath: (driveId: string, documentId: string): string => {
      return path.join(storage.filesystemPath!, driveId, `${documentId}.json`);
    },
    server: driveServer,
  };
};

async function addDefaultDrive(
  driveServer: IDocumentDriveServer,
  drive: DriveInput,
  serverPort: number,
) {
  let driveId = drive.global.slug ?? drive.global.id;
  try {
    // add default drive
    const driveDoc = await driveServer.addDrive(drive);
    driveId = driveDoc.state.global.slug ?? driveDoc.state.global.id;
  } catch (e) {
    if (e instanceof DriveAlreadyExistsError) {
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

  const driveUrl = `http://localhost:${serverPort}/${driveId ? `d/${drive.global.slug ?? drive.global.id}` : ""}`;
  return driveUrl;
}

async function startDevServer() {
  const vite = await createViteServer({
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

async function loadDocumentModels(path: string, vite: ViteDevServer) {
  try {
    console.log("> Loading document models from", path);
    await access(path);
    const localDMs = (await vite.ssrLoadModule(path)) as Record<
      string,
      DocumentModelModule
    >;
    const localDocumentModelModules = Object.values(localDMs);
    return localDocumentModelModules;
  } catch (e) {
    if ((e as FSError).code === "ENOENT") {
      console.warn("No local document models found");
    } else {
      console.error("Error loading document models", e);
    }
  }
}

async function loadSubgraphs(
  path: string,
  vite: ViteDevServer,
  graphqlManager: GraphQLManager,
) {
  try {
    console.log("> Loading subgraphs from", path);
    await access(path);
    const localSubgraphs = await vite.ssrLoadModule(path);
    for (const [name, subgraph] of Object.entries(localSubgraphs)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const SubgraphClass = subgraph[name] as SubgraphClass;
      if (isSubgraphClass(SubgraphClass)) {
        await graphqlManager.registerSubgraph(SubgraphClass, "graphql");
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

function joinDocumentModelModules(...modules: DocumentModelModule[][]) {
  return modules
    .flat()
    .toReversed()
    .reduce<DocumentModelModule[]>(
      (acc, curr) =>
        acc.find((dm) => dm.documentModel.id === curr.documentModel.id)
          ? acc
          : [...acc, curr],
      [],
    );
}

export { startServer };
