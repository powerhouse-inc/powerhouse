import { generateFromFile } from "@powerhousedao/codegen";
import {
  getConfig,
  type PowerhouseConfig,
} from "@powerhousedao/config/powerhouse";
import {
  DefaultStartServerOptions,
  type LocalReactor,
  startServer,
  type StartServerOptions,
} from "@powerhousedao/reactor-local";
import { type IReceiver } from "document-drive";
import {
  InternalTransmitter,
  type InternalTransmitterUpdate,
} from "document-drive/server/listener/transmitter/internal";
import { type Listener } from "document-drive/server/types";
import { type DocumentModelDocument } from "document-model";

export type SwitchboardOptions = StartServerOptions & {
  configFile?: string;
  generate?: boolean;
  watch?: boolean;
  dbPath?: string;
};

export const DefaultSwitchboardOptions = {
  ...DefaultStartServerOptions,
  dev: true,
};

export async function startLocalSwitchboard(
  switchboardOptions: SwitchboardOptions,
) {
  const baseConfig = getConfig(switchboardOptions.configFile);
  const options = {
    ...DefaultSwitchboardOptions,
    ...switchboardOptions,
  };

  const { https } = baseConfig.reactor ?? { https: false };

  const reactor = await startServer({
    ...options,
    https,
    logLevel: baseConfig.logLevel,
    storage: baseConfig.reactor?.storage || options.storage,
  });

  if (options.generate) {
    await addGenerateTransmitter(reactor, baseConfig);
  }
  return reactor;
}

async function addGenerateTransmitter(
  reactor: LocalReactor,
  config: PowerhouseConfig,
) {
  const receiver: IReceiver = {
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
  const listener: Listener = {
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

  const transmitter = new InternalTransmitter(
    listener,
    reactor.server,
    receiver,
  );

  listener.transmitter = transmitter;

  await listenerManager.setListener(listener.driveId, listener);
}
