import { getConfig } from "@powerhousedao/config/node";
import { command } from "cmd-ts";
import { getProjectInfo } from "../utils.js";
import { debugArgs } from "./common-args.js";

export const listArgs = {
  ...debugArgs,
};

export const list = command({
  name: "list",
  description: `
The list command displays information about installed Powerhouse packages in your project.
It reads the powerhouse.config.json file and shows the packages that are currently installed.

This command:
1. Examines your project configuration
2. Lists all installed Powerhouse packages
3. Provides a clear overview of your project's dependencies
4. Helps you manage and track your Powerhouse components
`,
  aliases: ["l"],
  args: listArgs,
  handler: (args) => {
    const projectInfo = getProjectInfo(args.debug);

    if (args.debug) {
      console.log(args);
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
      process.exit(0);
    } catch (e) {
      console.log("No packages found in the project");
      process.exit(1);
    }
  },
});
