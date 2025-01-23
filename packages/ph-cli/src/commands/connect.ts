import {
  startConnectStudio,
  ConnectStudioOptions,
} from "@powerhousedao/connect";
import { getConfig } from "@powerhousedao/config/powerhouse";
import { Command } from "commander";

export type ConnectOptions = ConnectStudioOptions;

export async function startConnect(connectOptions: ConnectOptions) {
  const { documentModelsDir, editorsDir } = getConfig();
  const options = { documentModelsDir, editorsDir, ...connectOptions };
  return await startConnectStudio(options);
}

export function connectCommand(program: Command) {
  program
    .command("connect")
    .description("Starts Connect Studio")
    .option("-p, --port <port>", "Port to run the server on", "3000")
    .option("-h, --host", "Expose the server to the network")
    .option("--https", "Enable HTTPS")
    .option(
      "--config-file <configFile>",
      "Path to the powerhouse.config.js file",
    )
    .option(
      "-le, --local-editors <localEditors>",
      "Link local document editors path",
    )
    .option(
      "-ld, --local-documents <localDocuments>",
      "Link local documents path",
    )
    .action(async (...args: [ConnectOptions]) => {
      await startConnectStudio(...args);
    });
}

if (process.argv.at(2) === "spawn") {
  const optionsArg = process.argv.at(3);
  const options = optionsArg ? (JSON.parse(optionsArg) as ConnectOptions) : {};
  startConnect(options).catch((e: unknown) => {
    throw e;
  });
}
