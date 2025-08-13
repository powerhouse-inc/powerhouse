import { isLogLevel } from "@powerhousedao/config";
import { startAPI } from "@powerhousedao/reactor-api";
import {
  startViteServer,
  VitePackageLoader,
} from "@powerhousedao/reactor-api/packages/vite-loader";
import {
  InMemoryCache,
  logger,
  ReactorBuilder,
  type DefaultRemoteDriveInput,
} from "document-drive";
import dotenv from "dotenv";
import path from "node:path";
import {
  DefaultStartServerOptions,
  type LocalReactor,
  type RemoteDriveInputSimple,
  type StartServerOptions,
} from "./types.js";
import { addDefaultDrive, createStorage } from "./util.js";

dotenv.config();

/**
 * Normalizes remote drive input to DefaultRemoteDriveInput format.
 * If a string URL is provided, it uses Connect-compatible defaults.
 */
function normalizeRemoteDriveInput(
  input: RemoteDriveInputSimple,
): DefaultRemoteDriveInput {
  if (typeof input === "string") {
    // URL-only input, use Connect-compatible defaults
    return {
      url: input,
      options: {
        sharingType: "public",
        availableOffline: true,
        listeners: [
          {
            block: true,
            callInfo: {
              data: input,
              name: "switchboard-push",
              transmitterType: "SwitchboardPush",
            },
            filter: {
              branch: ["main"],
              documentId: ["*"],
              documentType: ["*"],
              scope: ["global"],
            },
            label: "Switchboard Sync",
            listenerId: "1",
            system: true,
          },
        ],
        triggers: [],
      },
    };
  }

  // Already a complete configuration, return as-is
  return input;
}

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
    remoteDrives = [],
    mcp,
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
  if (dev) {
    // TODO get path from powerhouse config
    const basePath = process.cwd();
    packages.push(basePath);
  }

  // create document drive server with all available document models & storage
  const cache = new InMemoryCache();
  const reactorBuilder = new ReactorBuilder([])
    .withCache(cache)
    .withStorage(createStorage(storage, cache));

  const driveServer = reactorBuilder.build();

  // init drive server + conditionally add a default drive
  await driveServer.initialize();
  const driveUrl = options?.disableDefaultDrive
    ? null
    : await addDefaultDrive(driveServer, drive, serverPort);

  // create loader
  const packageLoader = vite ? await VitePackageLoader.build(vite) : undefined;

  // start api
  const api = await startAPI(driveServer, {
    port: serverPort,
    dbPath,
    https: options?.https,
    packageLoader,
    configFile,
    packages,
    mcp,
    // processors: {
    //   "ph/common/drive-analytics": [DriveAnalyticsProcessorFactory],
    // },
  });

  // add vite middleware after express app is initialized if applicable
  if (vite) {
    api.app.use(vite.middlewares);
  }

  // Add remote drives after full initialization (including PackageManager)
  if (remoteDrives.length > 0) {
    const processedRemoteDrives = remoteDrives.map(normalizeRemoteDriveInput);

    for (const remoteDrive of processedRemoteDrives) {
      try {
        await driveServer.addRemoteDrive(remoteDrive.url, remoteDrive.options);
      } catch (error) {
        logger.error(
          `  ➜  Failed to connect to remote drive ${remoteDrive.url}:`,
          error,
        );
      }
    }
  }

  if (driveUrl) {
    logger.info(`  ➜  Reactor:   ${driveUrl}`);
  } else {
    logger.info(
      `  ➜  Reactor:   http://localhost:${serverPort}/graphql (no default drive)`,
    );
  }

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
