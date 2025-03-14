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
  return reactor.addListener(
    "powerhouse",
    {
      onStrands: async function (strands) {
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
    },
    {
      filter: {
        documentType: ["powerhouse/document-model"],
        scope: ["global"],
        branch: ["*"],
        documentId: ["*"],
      },
      block: false,
      listenerId: "reactor-local-document-model-generator",
      label: "reactor-local-document-model-generator",
    },
  );
}
