import { Command } from "commander";
import path from "node:path";
import { CommandActionType } from "../types.js";
import { getProjectInfo } from "../utils.js";
export const inspect: CommandActionType<
  [
    string,
    {
      debug?: boolean;
    },
  ]
> = async (packageName, options) => {
  if (options.debug) {
    console.log(">>> command arguments", { options });
  }

  const projectInfo = getProjectInfo(options.debug);

  if (options.debug) {
    console.log("\n>>> projectInfo", projectInfo);
  }

  const manifest = (await import(path.join(packageName, "manifest"))) as {
    editors: { name: string; id: string }[];
    documentModels: { name: string; id: string }[];
    default: { name: string };
    name: string;
  };

  console.log(manifest.name);
  if (manifest.documentModels) {
    console.log("\nDocument Models:");
    manifest.documentModels.forEach((model) => {
      console.log(`- ${model.name} (${model.id})`);
    });
  }

  if (manifest.editors) {
    console.log("\nEditors:");
    manifest.editors.forEach((editor) => {
      console.log(`- ${editor.name} (${editor.id})`);
    });
  }
};

export function inspectCommand(program: Command) {
  program
    .command("inspect")
    .alias("is")
    .description("Inspect a package")
    .option("--debug", "Show additional logs")
    .argument("<packageName>", "The name of the package to inspect")
    .action(inspect);
}
