import type {
  ConnectBuildOptions,
  ConnectCommonOptions,
  ConnectPreviewOptions,
  ConnectStudioOptions,
} from "@powerhousedao/builder-tools";
import { Command } from "commander";
import {
  connectBuildHelp,
  connectPreviewHelp,
  connectStudioHelp,
} from "../../help.js";
import type { CommandActionType } from "../../types.js";
import { setCustomHelp } from "../../utils.js";

type CliConnectCommonOptions = Pick<
  ConnectCommonOptions,
  "base" | "mode" | "configFile" | "projectRoot" | "viteConfigFile"
>;

type CliConnectStudioOptions = ConnectStudioOptions["devServerOptions"] &
  CliConnectCommonOptions;

type CliConnectBuildOptions = Omit<
  ConnectBuildOptions,
  keyof ConnectCommonOptions
> &
  CliConnectCommonOptions;

type CliConnectPreviewOptions = Omit<
  ConnectPreviewOptions,
  keyof ConnectCommonOptions
> &
  CliConnectCommonOptions;

async function startConnectStudio(options: CliConnectStudioOptions = {}) {
  const { startConnectStudio } =
    await import("../../services/legacy/connect.old.js");
  const { port, host, open, cors, strictPort, force, ...otherOptions } =
    options;
  return startConnectStudio({
    ...otherOptions,
    devServerOptions: { port, host, open, cors, strictPort, force },
  });
}

export const connectStudioCommand: CommandActionType<
  [CliConnectStudioOptions],
  void
> = (options) => {
  return startConnectStudio(options);
};

const studioCommand = new Command("studio")
  .description("Starts Connect Studio (default)")
  .option("--port <port>", "Port to run the server on", "3000")
  .option("--host", "Expose the server to the network")
  .option("--open", "Open browser on startup")
  .option("--cors", `Enable CORS`)
  .option("--strictPort", `Exit if specified port is already in use`)
  .option("--force", `Force the optimizer to ignore the cache and re-bundle`)
  .option("--mode <mode>", `Vite mode to use`)
  .option("--config-file <configFile>", "Path to the powerhouse.config.js file")
  .option("--vite-config-file <viteConfigFile>", "Path to the vite config file")
  .option(
    "--project-root <projectRoot>",
    "The root directory of the project",
    process.cwd(),
  )
  .action(connectStudioCommand);

setCustomHelp(studioCommand, connectStudioHelp);

async function buildConnect(options?: CliConnectBuildOptions) {
  const { buildConnect } = await import("../../services/legacy/connect.old.js");
  return buildConnect(options);
}

export const buildConnectCommand: CommandActionType<
  [CliConnectBuildOptions],
  void
> = (options) => {
  return buildConnect(options);
};

const buildCommand = new Command("build")
  .description("Build Connect project")
  .option(
    "--outDir <outDir>",
    "Output directory. Defaults to '.ph/connect-build/dist/'",
  )
  .option("--base <base>", "Base path for the app")
  .option("--mode <mode>", `Vite mode to use`)
  .option("--config-file <configFile>", "Path to the powerhouse.config.js file")
  .option("--vite-config-file <viteConfigFile>", "Path to the vite config file")
  .option(
    "--project-root <projectRoot>",
    "The root directory of the project",
    process.cwd(),
  )
  .action(buildConnectCommand);
setCustomHelp(buildCommand, connectBuildHelp);

async function previewConnect(options?: CliConnectPreviewOptions) {
  const { previewConnect } =
    await import("../../services/legacy/connect.old.js");
  return previewConnect(options);
}

export const previewConnectCommand: CommandActionType<
  [CliConnectPreviewOptions],
  void
> = (options) => {
  return previewConnect(options).then();
};

const previewCommand = new Command("preview")
  .description("Preview built Connect project")
  .option(
    "--outDir <outDir>",
    "Output directory. Defaults to '.ph/connect-build/dist/'",
  )
  .option("--port <port>", "Port to run the server on", "4173")
  .option("--host", "Expose the server to the network")
  .option("--open", "Open browser on startup")
  .option("--strictPort", `Exit if specified port is already in use`)
  .option("--base <base>", "Base path for the app")
  .option("--mode <mode>", `Vite mode to use`)
  .option("--config-file <configFile>", "Path to the powerhouse.config.js file")
  .option("--vite-config-file <viteConfigFile>", "Path to the vite config file")
  .option(
    "--project-root <projectRoot>",
    "The root directory of the project",
    process.cwd(),
  )
  .action(previewConnectCommand);

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
  const options = optionsArg
    ? (JSON.parse(optionsArg) as CliConnectStudioOptions)
    : {};
  startConnectStudio(options).catch((e: unknown) => {
    throw e;
  });
}
