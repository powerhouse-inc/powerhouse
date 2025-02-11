import { Command } from "commander";
import { CommandActionType } from "../types.js";
import { getProjectInfo } from "../utils.js";

export const list: CommandActionType<
  [
    {
      debug?: boolean;
    },
  ]
> = (options) => {
  if (options.debug) {
    console.log(">>> command arguments", { options });
  }

  const projectInfo = getProjectInfo(options.debug);

  if (options.debug) {
    console.log("\n>>> projectInfo", projectInfo);
  }

  console.log("Listing packages 📦 ...");
};

export function listCommand(program: Command) {
  program
    .command("list")
    .alias("l")
    .description("List installed packages")
    .option("--debug", "Show additional logs")
    .action(list);
}
