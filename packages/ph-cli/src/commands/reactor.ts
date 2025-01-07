import { Command } from "commander";
import {
  DefaultStartServerOptions,
  startServer,
  StartServerOptions,
  LocalReactor,
} from "@powerhousedao/reactor-local";
import { generateFromFile } from "@powerhousedao/codegen";
import { CommandActionType } from "../types.js";
import { getConfig } from "@powerhousedao/config/powerhouse";

export type ReactorOptions = StartServerOptions & {
  generate?: boolean;
  watch?: boolean;
  dbPath?: string;
};

export const DefaultReactorOptions = {
  ...DefaultStartServerOptions,
  dev: true,
};

async function startLocalReactor(reactorOptions: ReactorOptions) {
  const baseConfig = getConfig();
  const options = { ...DefaultReactorOptions, ...reactorOptions };
  const reactor = await startServer(options);

  if (options.generate) {
    const generateTransmitter = await reactor.addListener(
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
            await generateFromFile(path, baseConfig);
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
  return reactor;
}

export const reactor: CommandActionType<
  [ReactorOptions],
  Promise<LocalReactor>
> = (options) => {
  return startLocalReactor(options);
};

export function reactorCommand(program: Command) {
  program
    .command("reactor")
    .description("Starts local reactor")
    .option("--port <PORT>", "port to host the api", "4001")
    .option("--generate", "generate code when document model is updated")
    .option("--db-path <DB_PATH>", "path to the database")
    .option(
      "-w, --watch",
      "if the reactor should watch for local changes to document models and processors",
    )
    .action(async (...args: [ReactorOptions]) => {
      await reactor(...args);
    });
}

if (process.argv.at(2) === "spawn") {
  const optionsArg = process.argv.at(3);
  const options = optionsArg ? (JSON.parse(optionsArg) as ReactorOptions) : {};
  startLocalReactor(options)
    .then((reactor) => {
      process.send?.(`driveUrl:${reactor.driveUrl}`);
    })
    .catch((e: unknown) => {
      throw e;
    });
}
