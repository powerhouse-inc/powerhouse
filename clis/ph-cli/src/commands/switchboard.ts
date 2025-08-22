import { type SwitchboardReactor } from "@powerhousedao/switchboard/server";
import { type Command } from "commander";
import { switchboardHelp } from "../help.js";
import { type ReactorOptions } from "../services/reactor.js";
import { type CommandActionType } from "../types.js";
import { setCustomHelp } from "../utils.js";

type SwitchboardOptions = ReactorOptions & {
  basePath?: string;
};

async function startLocalSwitchboard(options: SwitchboardOptions) {
  console.log("Starting switchboard", options);
  if (options.basePath) {
    console.log(`Setting BASE_PATH to ${options.basePath}`);
    process.env.BASE_PATH = options.basePath;
  }

  const Switchboard = await import("../services/switchboard.js");
  const { startSwitchboard } = Switchboard;

  // Extract only the props that switchboard expects
  const { port: rawPort, configFile, dev, dbPath, packages } = options;

  const port = typeof rawPort === "string" ? parseInt(rawPort) : rawPort;

  return startSwitchboard({
    port,
    configFile,
    dev,
    dbPath,
    packages,
  });
}

export const switchboard: CommandActionType<
  [ReactorOptions],
  Promise<SwitchboardReactor>
> = async (options) => {
  return await startLocalSwitchboard(options);
};

export function switchboardCommand(program: Command) {
  const command = program
    .command("switchboard")
    .description("Starts local switchboard")
    .option("--port <PORT>", "port to host the api", "4001")
    .option(
      "--config-file <configFile>",
      "Path to the powerhouse.config.js file",
      "./powerhouse.config.json",
    )
    .option("--generate", "generate code when document model is updated")
    .option("--dev", "enable development mode to load local packages")
    .option("--db-path <DB_PATH>", "path to the database")
    .option("--https-key-file <HTTPS_KEY_FILE>", "path to the ssl key file")
    .option("--https-cert-file <HTTPS_CERT_FILE>", "path to the ssl cert file")
    .option(
      "--packages <packages...>",
      "list of packages to be loaded, if defined then packages on config file are ignored",
    )
    .option(
      "--base-path <basePath>",
      "base path for the API endpoints (sets the BASE_PATH environment variable)",
    )
    .option("--mcp", "enable Mcp route at /mcp. Default: true")
    .action(async (...args: [ReactorOptions]) => {
      const { defaultDriveUrl } = await switchboard(...args);
      console.log("   ➜  Switchboard:", defaultDriveUrl);
    });

  setCustomHelp(command, switchboardHelp);
}

if (process.argv.at(2) === "spawn") {
  const optionsArg = process.argv.at(3);
  const options = optionsArg ? (JSON.parse(optionsArg) as ReactorOptions) : {};
  startLocalSwitchboard(options)
    .then((reactor) => {
      process.send?.(`driveUrl:${reactor.defaultDriveUrl}`);
    })
    .catch((e: unknown) => {
      throw e;
    });
}
