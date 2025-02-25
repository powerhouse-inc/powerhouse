import { getConfig } from "@powerhousedao/config/powerhouse";
import {
  ConnectStudioOptions,
  startConnectStudio,
} from "@powerhousedao/builder-tools/connect-studio";
import { Command } from "commander";
import packageJson from "../../package.json" assert { type: "json" };
const version = packageJson.version;
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
    .option("--open", "Open the browser")
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
    .action(async (...args: [ConnectStudioOptions]) => {
      const connectOptions = args.at(0) || {};
      const { documentModelsDir, editorsDir, packages, studio, logLevel } =
        getConfig();
      await startConnectStudio({
        port: studio?.port?.toString() || undefined,
        packages,
        phCliVersion: typeof version === "string" ? version : undefined,
        localDocuments: documentModelsDir || undefined,
        localEditors: editorsDir || undefined,
        open: studio?.openBrowser,
        logLevel: logLevel,
        ...connectOptions,
      });
    });
}

if (process.argv.at(2) === "spawn") {
  const optionsArg = process.argv.at(3);
  const options = optionsArg
    ? (JSON.parse(optionsArg) as ConnectStudioOptions)
    : {};
  startConnect(options).catch((e: unknown) => {
    throw e;
  });
}
