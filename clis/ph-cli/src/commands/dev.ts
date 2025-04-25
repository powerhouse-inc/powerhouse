import { type Command } from "commander";
import { devHelp } from "../help.js";
import { type DevOptions } from "../services/dev.js";
import { type CommandActionType } from "../types.js";
import { setCustomHelp } from "../utils.js";

async function startDev(options: DevOptions) {
  const Dev = await import("../services/dev.js");
  const { startDev } = Dev;
  return startDev(options);
}

export const dev: CommandActionType<[DevOptions]> = async (options) => {
  return startDev(options);
};

export function devCommand(program: Command) {
  const cmd = program
    .command("dev")
    .description("Starts dev environment")
    .option("--generate", "generate code when document model is updated")
    .option("--switchboard-port <port>", "port to use for the switchboard")
    .option("--https-key-file <HTTPS_KEY_FILE>", "path to the ssl key file")
    .option("--https-cert-file <HTTPS_CERT_FILE>", "path to the ssl cert file")
    .option(
      "--config-file <configFile>",
      "Path to the powerhouse.config.js file",
    )
    .option(
      "-w, --watch",
      "if the switchboard should watch for local changes to document models and processors",
    );

  // Use the setCustomHelp utility to apply custom help formatting
  setCustomHelp(cmd, devHelp);

  cmd.action(dev);
}
