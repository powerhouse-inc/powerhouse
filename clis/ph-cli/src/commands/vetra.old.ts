import type { Command } from "commander";
import { vetraHelp } from "../help.js";
import type { CommandActionType } from "../types.js";
import { setCustomHelp } from "../utils.js";

export type DevOptions = {
  generate?: boolean;
  switchboardPort?: number;
  connectPort?: number;
  configFile?: string;
  httpsKeyFile?: string;
  httpsCertFile?: string;
  verbose?: boolean;
  remoteDrive?: string;
  disableConnect?: boolean;
  interactive?: boolean;
  watch?: boolean;
};
async function startVetraEnv(options: DevOptions) {
  const Vetra = await import("../services/vetra.old.js");
  const { startVetra } = Vetra;
  return startVetra(options);
}

export const vetra: CommandActionType<
  [DevOptions & { logs?: boolean; watch?: boolean }]
> = async (options) => {
  return startVetraEnv({
    ...options,
    verbose: options.logs,
    disableConnect: options.disableConnect,
    interactive: options.interactive,
    watch: options.watch,
  });
};

export function vetraCommand(program: Command) {
  const cmd = program
    .command("vetra")
    .option("--logs", "Show additional logs")
    .description(
      "Starts Vetra development environment with switchboard, reactor, and connect",
    )
    .option(
      "--switchboard-port <port>",
      "port to use for the Vetra switchboard (default: 4001)",
    )
    .option("--connect-port <port>", "port to use for Connect (default: 3000)")
    .option("--https-key-file <HTTPS_KEY_FILE>", "path to the ssl key file")
    .option("--https-cert-file <HTTPS_CERT_FILE>", "path to the ssl cert file")
    .option(
      "--config-file <configFile>",
      "Path to the powerhouse.config.js file",
    )
    .option(
      "-w, --watch",
      "Enable dynamic loading for document-models and editors in connect-studio and switchboard",
    )
    .option(
      "--remote-drive <url>",
      "URL of remote drive to connect to (skips switchboard initialization)",
    )
    .option(
      "--disable-connect",
      "Skip Connect initialization (only start switchboard and reactor)",
    )
    .option(
      "--interactive",
      "Enable interactive mode for code generation (requires user confirmation before generating code)",
    );

  // Use the setCustomHelp utility to apply custom help formatting
  setCustomHelp(cmd, vetraHelp);

  cmd.action(vetra);
}
