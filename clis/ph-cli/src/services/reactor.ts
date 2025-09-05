import { generateFromFile } from "@powerhousedao/codegen";
import type { PowerhouseConfig } from "@powerhousedao/config";
import { getConfig } from "@powerhousedao/config/node";
import type {
  LocalReactor,
  RemoteDriveInputSimple,
  StartServerOptions,
} from "@powerhousedao/reactor-local";
import {
  DefaultStartServerOptions,
  startServer,
} from "@powerhousedao/reactor-local";
import type {
  InternalTransmitterUpdate,
  IProcessor,
  ServerListener,
} from "document-drive";
import { InternalTransmitter } from "document-drive";
import type { DocumentModelDocument } from "document-model";
import { readFileSync } from "node:fs";

export type ReactorOptions = StartServerOptions & {
  configFile?: string;
  generate?: boolean;
  watch?: boolean;
  dbPath?: string;
  disableDefaultDrive?: boolean;
  remoteDrives?: string;
  remoteDrivesConfig?: string;
};

export const DefaultReactorOptions = {
  ...DefaultStartServerOptions,
  dev: true,
};

function parseRemoteDrives(
  remoteDrivesInput?: string,
  configFile?: string,
): RemoteDriveInputSimple[] {
  let drives: RemoteDriveInputSimple[] = [];

  // Parse URLs from --remote-drives
  if (remoteDrivesInput) {
    drives = remoteDrivesInput
      .split(",")
      .map((url) => url.trim())
      .filter((url) => url);
  }

  // Parse config file from --remote-drives-config
  if (configFile) {
    try {
      const fileContent = readFileSync(configFile, "utf-8");
      const configDrives = JSON.parse(fileContent) as RemoteDriveInputSimple[];
      drives = drives.concat(configDrives);
    } catch (error) {
      throw new Error(
        `Failed to read remote drives config file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return drives;
}

export async function startLocalReactor(reactorOptions: ReactorOptions) {
  const baseConfig = getConfig(reactorOptions.configFile);
  const options = {
    ...DefaultReactorOptions,
    ...reactorOptions,
  };

  const { https } = baseConfig.reactor ?? { https: false };

  // Parse remote drives configuration
  const remoteDrives = parseRemoteDrives(
    reactorOptions.remoteDrives,
    reactorOptions.remoteDrivesConfig,
  );

  const reactor = await startServer({
    ...options,
    https,
    logLevel: baseConfig.logLevel,
    storage: baseConfig.reactor?.storage || options.storage,
    remoteDrives,
  });

  if (options.generate) {
    await addGenerateTransmitter(reactor, baseConfig);
  }
  return reactor;
}

// TODO: instead of doing this by hand, we should use the processor manager
async function addGenerateTransmitter(
  reactor: LocalReactor,
  config: PowerhouseConfig,
) {
  const processor: IProcessor = {
    onStrands: async function (
      strands: InternalTransmitterUpdate<DocumentModelDocument>[],
    ) {
      const documentPaths = new Set<string>();
      for (const strand of strands) {
        documentPaths.add(
          reactor.getDocumentPath(strand.driveId, strand.documentId),
        );
      }
      for (const path of documentPaths) {
        await generateFromFile(path, config);
      }
      return Promise.resolve();
    },
    onDisconnect: () => Promise.resolve(),
  };

  const listenerManager = reactor.server.listeners;

  // todo: simplify
  const listener: ServerListener = {
    driveId: "powerhouse",
    listenerId: "reactor-local-document-model-generator",
    label: "reactor-local-document-model-generator",
    filter: {
      documentType: ["powerhouse/document-model"],
      scope: ["global"],
      branch: ["*"],
      documentId: ["*"],
    },
    block: false,
    system: false,
    callInfo: {
      data: "",
      name: "reactor-local-document-model-generator",
      transmitterType: "Internal",
    },
  };

  const transmitter = new InternalTransmitter(reactor.server, processor);

  listener.transmitter = transmitter;

  await listenerManager.setListener(listener.driveId, listener);
}
