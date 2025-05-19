import { type Command } from "commander";
import { connectHelp } from "../help.js";
import { type ConnectOptions } from "../services/connect.js";
import { type CommandActionType } from "../types.js";
import { setCustomHelp } from "../utils.js";

async function runBuildConnect(options: ConnectOptions) {
  const Build = await import("../services/build.js");
  const { buildConnect } = Build;
  return buildConnect(options);
}

export const buildConnect: CommandActionType<
  [ConnectOptions],
  Promise<void>
> = async (options) => {
  const result = await runBuildConnect(options);
  console.log(result);
};

export function buildConnectCommand(program: Command) {
  const cmd = program
    .command("build-connect")
    .description("Builds Connect Studio")
    .option(
      "--config-file <configFile>",
      "Path to the powerhouse.config.js file",
    );

  // Use the setCustomHelp utility to apply custom help formatting
  setCustomHelp(cmd, connectHelp);

  cmd.action(async (...args: [ConnectOptions]) => {
    await buildConnect(...args);
  });
}
