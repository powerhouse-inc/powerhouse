import { type LocalReactor } from "@powerhousedao/reactor-local";
import { type Command } from "commander";
import { switchboardHelp } from "../help.js";
import { type SwitchboardOptions } from "../services/switchboard.js";
import { type CommandActionType } from "../types.js";

async function startLocalSwitchboard(options: SwitchboardOptions) {
  const Switchboard = await import("../services/switchboard.js");
  const { startLocalSwitchboard } = Switchboard;
  return startLocalSwitchboard(options);
}

export const switchboard: CommandActionType<
  [SwitchboardOptions],
  Promise<LocalReactor>
> = async (options) => {
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
    .addHelpText("after", switchboardHelp)
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
