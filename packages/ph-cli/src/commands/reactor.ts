import { fileURLToPath } from "node:url";
import path from "node:path";
import { Command } from "commander";
import { startServer } from "@powerhousedao/reactor-local";
import { getConfig, generateFromFile } from "@powerhousedao/codegen";
import { CommandActionType } from "../types.js";

export type ReactorOptions = {
  port?: number;
  generate?: boolean;
};

const __dirname =
  import.meta.dirname || path.dirname(fileURLToPath(import.meta.url));

const defaultReactorOptions: ReactorOptions = {
  port: 4001,
  generate: false,
};

async function startLocalReactor(options = defaultReactorOptions) {
  const { port, generate } = options;
  const baseConfig = getConfig();
  const reactor = await startServer({ connect: { port } });

  if (!generate) {
    return;
  }

  const generateTransmitter = await reactor.addListener(
    "powerhouse",
    {
      transmit: async function (strands) {
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
      disconnect: () => Promise.resolve(),
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

export const reactor: CommandActionType<[ReactorOptions]> = (options) => {
  return startLocalReactor(options);
};

export function reactorCommand(program: Command) {
  program
    .command("reactor")
    .description("Starts local reactor")
    .option("--port <PORT>", "port to host the api", "4001")
    .option("--generate", "generate code when document model is updated")
    .action(reactor);
}

if (process.argv.at(2) === "spawn") {
  const optionsArg = process.argv.at(3);
  const options = optionsArg ? (JSON.parse(optionsArg) as ReactorOptions) : {};
  startLocalReactor(options).catch((e) => {
    throw e;
  });
}
