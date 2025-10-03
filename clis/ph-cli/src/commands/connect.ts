import { Command } from "commander";
import {
  connectBuildHelp,
  connectPreviewHelp,
  connectStudioHelp,
} from "../help.js";
import type { ConnectOptions } from "../services/connect.js";
import type { CommandActionType } from "../types.js";
import { setCustomHelp } from "../utils.js";

async function startConnect(options?: ConnectOptions) {
  const Connect = await import("../services/connect.js");
  const { startConnect } = Connect;
  return startConnect(options);
}

export const connect: CommandActionType<[ConnectOptions], void> = (options) => {
  return startConnect(options);
};

const studioCommand = new Command("studio")
  .description("Starts Connect Studio (default)")
  // Vite dev config: https://github.com/vitejs/vite/blob/1ef57bc7700375bf4bca0edbf0a9e4517c5dd35b/packages/vite/src/node/cli.ts#L184
  .option("--port <port>", "Port to run the server on", "3000")
  .option("--host", "Expose the server to the network")
  .option("--open", "Open browser on startup")
  .option("--config-file <configFile>", "Path to the powerhouse.config.js file")
  .option("--cors", `Enable CORS`)
  .option("--strictPort", `Exit if specified port is already in use`)
  .option("--force", `Force the optimizer to ignore the cache and re-bundle`)
  .action(connect);

setCustomHelp(studioCommand, connectStudioHelp);

const buildCommand = new Command("build")
  .description("Build Connect project")
  .option("--base <base>", "Base path for the app")
  .option(
    "--project-root <path>",
    "The root directory of the project",
    process.cwd(),
  )
  .option("--assets-dir-name <name>", "The name of the assets directory")
  .option(
    "--external-packages-file-name <name>",
    "The name of the external packages file",
  )
  .option("--styles-file-name <name>", "The name of the styles file")
  .option("--connect-path <path>", "The path to the Connect dist directory")
  .action(async (...args: []) => {
    throw new Error("Not Implemented");
  });
setCustomHelp(buildCommand, connectBuildHelp);

const previewCommand = new Command("preview")
  .description("Preview built Connect project")
  .option("--base <base>", "Base path for the app")
  .option("--project-root <path>", "The root directory of the project")
  .option("-p, --port <port>", "The port to run the server on", "4173")
  .option("--open", "Open the browser")
  .action(async (...args: []) => {
    throw Error("Not Implemented");
  });
setCustomHelp(previewCommand, connectPreviewHelp);

export function connectCommand(program: Command) {
  return program
    .command("connect")
    .description("Powerhouse Connect commands")
    .allowUnknownOption(true)
    .addCommand(studioCommand, { isDefault: true })
    .addCommand(buildCommand)
    .addCommand(previewCommand);
}

if (process.argv.at(2) === "spawn") {
  const optionsArg = process.argv.at(3);
  const options = optionsArg ? (JSON.parse(optionsArg) as ConnectOptions) : {};
  startConnect(options).catch((e: unknown) => {
    throw e;
  });
}
