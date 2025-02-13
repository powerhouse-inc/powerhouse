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

  try {
    const manifest = (await import(path.join(packageName, "manifest"))) as {
      editors: { name: string; id: string }[];
      documentModels: { name: string; id: string }[];
      processors: { name: string; id: string }[];
      subgraphs: { name: string; id: string }[];
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

    if (manifest.processors) {
      console.log("\nProcessors:");
      manifest.processors.forEach((processor) => {
        console.log(`- ${processor.name} (${processor.id})`);
      });
    }

    if (manifest.subgraphs) {
      console.log("\nSubgraphs:");
      manifest.subgraphs.forEach((subgraph) => {
        console.log(`- ${subgraph.name} (${subgraph.id})`);
      });
    }
  } catch (e) {
    if (options.debug) {
      console.error(e);
    } else {
      console.log("No manifest found in the package");
    }
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
