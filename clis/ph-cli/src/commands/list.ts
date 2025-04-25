import { type PowerhouseConfig } from "@powerhousedao/config/powerhouse";
import { type Command } from "commander";
import path from "node:path";
import { listHelp } from "../help.js";
import { type CommandActionType } from "../types.js";
import { getProjectInfo } from "../utils.js";

export const list: CommandActionType<
  [
    {
      debug?: boolean;
    },
  ]
> = async (options) => {
  if (options.debug) {
    console.log(">>> command arguments", { options });
  }

  const projectInfo = getProjectInfo(options.debug);

  if (options.debug) {
    console.log("\n>>> projectInfo", projectInfo);
  }

  try {
    const phConfig = (await import(
      path.join(projectInfo.path, "powerhouse.config.json")
    )) as Pick<PowerhouseConfig, "packages">;

    if (!phConfig.packages || phConfig.packages.length === 0) {
      console.log("No packages found in the project");
      return;
    }

    console.log("Installed Packages:\n");
    phConfig.packages.forEach((pkg) => {
      console.log(pkg.packageName);
    });
  } catch (e) {
    console.log("No packages found in the project");
  }
};

export function listCommand(program: Command) {
  program
    .command("list")
    .alias("l")
    .description("List installed packages")
    .option("--debug", "Show additional logs")
    .addHelpText("after", listHelp)
    .action(list);
}
