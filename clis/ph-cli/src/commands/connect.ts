import { type Command } from "commander";
import { connectHelp } from "../help.js";
import { type ConnectOptions } from "../services/connect.js";
import { type CommandActionType } from "../types.js";
import { setCustomHelp } from "../utils.js";

async function startConnect(options: ConnectOptions) {
  const Connect = await import("../services/connect.js");
  const { startConnect } = Connect;
  return startConnect(options);
}

export const connect: CommandActionType<
  [ConnectOptions],
  Promise<void>
> = async (options) => {
  return startConnect(options);
};

export function connectCommand(program: Command) {
  const cmd = program
    .command("connect")
    .description("Starts Connect Studio")
    .option("-p, --port <port>", "Port to run the server on", "3000")
    .option("-h, --host", "Expose the server to the network")
    .option("--https", "Enable HTTPS")
    .option("--open", "Open the browser")
    .option(
      "--config-file <configFile>",
      "Path to the powerhouse.config.js file",
    );

  // Use the setCustomHelp utility to apply custom help formatting
  setCustomHelp(cmd, connectHelp);

  cmd.action(async (...args: [ConnectOptions]) => {
    await connect(...args);
  });
}

if (process.argv.at(2) === "spawn") {
  const optionsArg = process.argv.at(3);
  const options = optionsArg ? (JSON.parse(optionsArg) as ConnectOptions) : {};
  startConnect(options).catch((e: unknown) => {
    throw e;
  });
}
