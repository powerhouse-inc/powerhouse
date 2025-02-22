import { generateFromFile } from "@powerhousedao/codegen";
import { getConfig, PowerhouseConfig } from "@powerhousedao/config/powerhouse";
import {
  DefaultStartServerOptions,
  LocalReactor,
  startServer,
  StartServerOptions,
} from "@powerhousedao/reactor-local";
import { Command } from "commander";
import { CommandActionType } from "../types.js";

export type SwitchboardOptions = StartServerOptions & {
  configFile?: string;
  generate?: boolean;
  watch?: boolean;
  dbPath?: string;
  httpsKeyFile?: string;
  httpsCertFile?: string;
};

export const DefaultSwitchboardOptions = {
  ...DefaultStartServerOptions,
  dev: true,
};

async function startLocalSwitchboard(switchboardOptions: SwitchboardOptions) {
  const baseConfig = getConfig(switchboardOptions.configFile);
  const options = {
    ...DefaultSwitchboardOptions,
    ...switchboardOptions,
  };

  const https =
    switchboardOptions.httpsKeyFile && switchboardOptions.httpsCertFile
      ? {
          keyPath: switchboardOptions.httpsKeyFile,
          certPath: switchboardOptions.httpsCertFile,
        }
      : undefined;

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

export const switchboard: CommandActionType<
  [SwitchboardOptions],
  Promise<LocalReactor>
> = (options) => {
  return startLocalSwitchboard(options);
};

export function reactorCommand(program: Command) {
  program
    .command("switchboard")
    .alias("reactor")
    .description("Starts local switchboard")
    .option("--port <PORT>", "port to host the api", "4001")
    .option(
      "--config-file <configFile>",
      "Path to the powerhouse.config.js file",
      "./powerhouse.config.json",
    )
    .option("--generate", "generate code when document model is updated")
    .option("--db-path <DB_PATH>", "path to the database")
    .option("--https-key-file <HTTPS_KEY_FILE>", "path to the ssl key file")
    .option("--https-cert-file <HTTPS_CERT_FILE>", "path to the ssl cert file")
    .option(
      "-w, --watch",
      "if the reactor should watch for local changes to document models and processors",
    )
    .option(
      "--packages <packages...>",
      "list of packages to be loaded, if defined then packages on config file are ignored",
    )
    .action(async (...args: [SwitchboardOptions]) => {
      await switchboard(...args);
    });
}

if (process.argv.at(2) === "spawn") {
  const optionsArg = process.argv.at(3);
  const options = optionsArg
    ? (JSON.parse(optionsArg) as SwitchboardOptions)
    : {};
  startLocalSwitchboard(options)
    .then((switchboard) => {
      process.send?.(`driveUrl:${switchboard.driveUrl}`);
    })
    .catch((e: unknown) => {
      throw e;
    });
}
