import { isLogLevel } from "@powerhousedao/config";
import { startAPI } from "@powerhousedao/reactor-api";
import {
  driveDocumentModelModule,
  InMemoryCache,
  logger,
  ReactorBuilder,
} from "document-drive";
import {
  documentModelDocumentModelModule,
  type DocumentModelModule,
} from "document-model";
import dotenv from "dotenv";
import path from "node:path";
import {
  DefaultStartServerOptions,
  type LocalReactor,
  type StartServerOptions,
} from "./types.js";
import { addDefaultDrive, createStorage, startViteServer } from "./util.js";
import { VitePackageLoader } from "./vite-loader.js";

dotenv.config();

const startServer = async (
  options?: StartServerOptions,
): Promise<LocalReactor> => {
  process.setMaxListeners(0);
  const {
    port,
    storage,
    drive,
    dev,
    dbPath,
    packages = [],
    configFile,
    logLevel,
  } = {
    ...DefaultStartServerOptions,
    ...options,
  };

  process.env.LOG_LEVEL =
    process.env.LOG_LEVEL || (isLogLevel(logLevel) ? logLevel : "info");

  // be aware: this may not log anything if the log level is above debug
  logger.debug(`Setting log level to ${logLevel}.`);
  const serverPort = Number(process.env.PORT ?? port);

  // start vite server if dev
  const vite = dev ? await startViteServer() : undefined;

  // get paths to local document models
  if (vite) {
    // TODO get path from powerhouse config
    const basePath = process.cwd();
    packages.push(basePath);
  }

  // create document drive server with all available document models & storage
  const cache = new InMemoryCache();
  const driveServer = new ReactorBuilder([
    driveDocumentModelModule as DocumentModelModule,
    documentModelDocumentModelModule as DocumentModelModule,
  ])
    .withCache(cache)
    .withStorage(createStorage(storage, cache))
    .build();

  // init drive server + add a default drive
  await driveServer.initialize();
  const driveUrl = await addDefaultDrive(driveServer, drive, serverPort);

  // create loader
  const packageLoader = vite ? new VitePackageLoader(vite) : undefined;

  // start api
  const api = await startAPI(driveServer, {
    port: serverPort,
    dbPath,
    https: options?.https,
    packageLoader,
    configFile,
    packages,
    // processors: {
    //   "ph/common/drive-analytics": [DriveAnalyticsProcessorFactory],
    // },
  });

  // add vite middleware after express app is initialized if applicable
  if (vite) {
    api.app.use(vite.middlewares);
  }

  logger.info(`  ➜  Reactor:   ${driveUrl}`);

  return {
    driveUrl,
    getDocumentPath: (driveId: string, documentId: string): string => {
      if (!storage.filesystemPath) {
        throw new Error(
          `"getDocumentPath" is only available with the Filesystem storage adapter.`,
        );
      }
      return path.join(storage.filesystemPath, driveId, `${documentId}.json`);
    },
    server: driveServer,
  };
};

export { startServer };
