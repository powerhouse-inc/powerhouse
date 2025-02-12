/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Command } from "commander";
import path from "node:path";
import { CommandActionType } from "../types.js";
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

  const manifest: {
    editors: { name: string; id: string }[];
    documentModels: { name: string; id: string }[];
    default: { name: string };
  } = await import(path.join(projectInfo.path, "powerhouse.manifest.json"));

  console.log(manifest.default.name);
  console.log("\nDocument Models:");
  manifest.documentModels.forEach((model) => {
    console.log(`- ${model.name} (${model.id})`);
  });

  console.log("\nEditors:");
  manifest.editors.forEach((editor) => {
    console.log(`- ${editor.name} (${editor.id})`);
  });
};

export function listCommand(program: Command) {
  program
    .command("list")
    .alias("l")
    .description("List installed packages")
    .option("--debug", "Show additional logs")
    .action(list);
}
