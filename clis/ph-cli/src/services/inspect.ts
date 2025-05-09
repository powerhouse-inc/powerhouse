import fs from "node:fs";
import { getProjectInfo } from "../utils.js";

export type InspectOptions = {
  debug?: boolean;
};

export async function startInspect(
  packageName: string,
  options: InspectOptions,
) {
  if (options.debug) {
    console.log(">>> command arguments", { options });
  }

  const projectInfo = getProjectInfo(options.debug);

  if (options.debug) {
    console.log("\n>>> projectInfo", projectInfo);
  }

  try {
    const loadManifest = (path: string) =>
      JSON.parse(fs.readFileSync(path, "utf-8")) as {
        editors: { name: string; id: string }[];
        documentModels: { name: string; id: string }[];
        processors: { name: string; id: string }[];
        subgraphs: { name: string; id: string }[];
        default: { name: string };
        name: string;
      };
    const manifest = loadManifest(
      `${process.cwd()}/node_modules/${packageName}/dist/powerhouse.manifest.json`,
    );

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
}
