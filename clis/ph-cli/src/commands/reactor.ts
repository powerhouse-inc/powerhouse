import { type LocalReactor } from "@powerhousedao/reactor-local";
import { type Command } from "commander";
import { reactorHelp } from "../help.js";
import { type ReactorOptions } from "../services/reactor.js";
import { type CommandActionType } from "../types.js";
import { setCustomHelp } from "../utils.js";

async function startLocalSwitchboard(options: ReactorOptions) {
  const Switchboard = await import("../services/reactor.js");
  const { startLocalReactor } = Switchboard;
  return startLocalReactor(options);
}

export const switchboard: CommandActionType<
  [ReactorOptions],
  Promise<LocalReactor>
> = async (options) => {
  return startLocalSwitchboard(options);
};

export function reactorCommand(program: Command) {
  const command = program
    .command("reactor")
    .description("Starts local reactor")
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
      "--disable-default-drive",
      "disable automatic creation of the default 'powerhouse' drive",
    )
    .option(
      "--packages <packages...>",
      "list of packages to be loaded, if defined then packages on config file are ignored",
    )
    .option("--remote-drives <urls>", "comma-separated remote drive URLs")
    .option(
      "--remote-drives-config <configFile>",
      "path to JSON file containing remote drive configurations",
    )
    .action(async (...args: [ReactorOptions]) => {
      await switchboard(...args);
    });

  setCustomHelp(command, reactorHelp);
}

if (process.argv.at(2) === "spawn") {
  const optionsArg = process.argv.at(3);
  const options = optionsArg ? (JSON.parse(optionsArg) as ReactorOptions) : {};
  startLocalSwitchboard(options)
    .then((reactor) => {
      process.send?.(`reactorUrl:${reactor.driveUrl}`);
    })
    .catch((e: unknown) => {
      throw e;
    });
}
