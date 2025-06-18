import { getConfig } from "@powerhousedao/config/utils";
import { type Command } from "commander";
import { listHelp } from "../help.js";
import { type CommandActionType } from "../types.js";
import { getProjectInfo, setCustomHelp } from "../utils.js";

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
    const phConfig = getConfig(projectInfo.path + "/powerhouse.config.json");

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
  const command = program
    .command("list")
    .alias("l")
    .description("List installed packages")
    .option("--debug", "Show additional logs")
    .action(list);

  setCustomHelp(command, listHelp);
}
