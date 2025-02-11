import { Command } from "commander";
import { CommandActionType } from "../types.js";
import { getProjectInfo } from "../utils.js";

export const inspect: CommandActionType<
  [
    string,
    {
      debug?: boolean;
    },
  ]
> = (packageName, options) => {
  if (options.debug) {
    console.log(">>> command arguments", { options });
  }

  if (!packageName) {
    throw new Error("❌ Package name is required");
  }

  console.log(">>> packageName", packageName);
  const projectInfo = getProjectInfo(options.debug);

  if (options.debug) {
    console.log("\n>>> projectInfo", projectInfo);
  }

  console.log("Inspecting package 📦 ...");
};

export function inspectCommand(program: Command) {
  program
    .command("inspect")
    .alias("is")
    .description("Inspect a package")
    .option("--debug", "Show additional logs")
    .argument("[package]", "Name of the package to inspect")
    .action(inspect);
}
