import { isLogLevel } from "@powerhousedao/config";
import {
  EventBus,
  ReactorBuilder,
  ReactorClientBuilder,
  driveCollectionId,
  parseDriveUrl,
} from "@powerhousedao/reactor";
import {
  VitePackageLoader,
  initializeAndStartAPI,
  startViteServer,
} from "@powerhousedao/reactor-api";
import type { DefaultRemoteDriveInput } from "document-drive";
import { logger, type DocumentModelModule } from "document-model";
import dotenv from "dotenv";
import path from "node:path";
import type {
  LocalReactor,
  RemoteDriveInputSimple,
  StartServerOptions,
} from "./types.js";
import { DefaultStartServerOptions } from "./types.js";

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

  // TODO get path from powerhouse config
  const basePath = process.cwd();
  // start vite server if dev
  const vite = dev ? await startViteServer(basePath) : undefined;

  // get paths to local document models
  if (dev) {
    packages.push(basePath);
  }

  const initializeClient = async (documentModels: DocumentModelModule[]) => {
    const eventBus = new EventBus();
    const builder = new ReactorBuilder()
      .withEventBus(eventBus)
      .withDocumentModels(documentModels);

    return new ReactorClientBuilder().withReactorBuilder(builder).buildModule();
  };

  // create loader
  const packageLoader = vite ? VitePackageLoader.build(vite) : undefined;

  // start api
  const api = await initializeAndStartAPI(
    initializeClient,
    {
      port: serverPort,
      dbPath,
      https: options?.https,
      packageLoader,
      configFile,
      packages,
      mcp,
    },
    "switchboard",
  );

  // add vite middleware after express app is initialized if applicable
  if (vite) {
    api.app.mountRawMiddleware(vite.middlewares);
  }

  // Conditionally add a default drive
  let driveUrl: string | null = null;
  if (!options?.disableDefaultDrive) {
    let driveId = drive.id;
    if (!driveId || driveId.length === 0) {
      driveId = drive.slug;
    }
    if (!driveId || driveId.length === 0) {
      throw new Error("Invalid Drive Id");
    }

    try {
      const { driveCreateDocument, driveCreateState } =
        await import("document-drive");
      const { global } = driveCreateState();
      const document = driveCreateDocument({
        global: {
          ...global,
          name: drive.global.name,
          icon: drive.global.icon ?? global.icon,
        },
        local: {
          availableOffline: drive.local?.availableOffline ?? false,
          sharingType: drive.local?.sharingType ?? "public",
          listeners: drive.local?.listeners ?? [],
          triggers: drive.local?.triggers ?? [],
        },
      });

      if (drive.id && drive.id.length > 0) {
        document.header.id = drive.id;
      }
      if (drive.slug && drive.slug.length > 0) {
        document.header.slug = drive.slug;
      }
      if (drive.global.name) {
        document.header.name = drive.global.name;
      }

      await api.client.create(document);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (!errorMessage.includes("already exists")) {
        throw e;
      }
    }

    driveUrl = `http://localhost:${serverPort}/d/${driveId}`;
  }

  // Add remote drives after full initialization (including PackageManager)
  if (remoteDrives.length > 0) {
    const processedRemoteDrives = remoteDrives.map(normalizeRemoteDriveInput);

    for (const remoteDrive of processedRemoteDrives) {
      try {
        const parsed = parseDriveUrl(remoteDrive.url);
        const remoteName = `remote-drive-${parsed.driveId}-${crypto.randomUUID()}`;
        await api.syncManager.add(
          remoteName,
          driveCollectionId("main", parsed.driveId),
          {
            type: "gql",
            parameters: { url: parsed.graphqlEndpoint },
          },
        );
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
  };
};

export { startServer };
