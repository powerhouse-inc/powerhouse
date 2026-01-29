import type { Manifest } from "document-model";
import fs from "node:fs";
import type { InspectArgs } from "../types.js";
import { getProjectInfo } from "../utils.js";
export function startInspect(args: InspectArgs) {
  if (args.debug) {
    console.log(">>> command arguments", args);
  }

  const projectInfo = getProjectInfo(args.debug);
  const { packageName } = args;

  if (args.debug) {
    console.log("\n>>> projectInfo", projectInfo);
  }

  try {
    const loadManifest = (path: string) =>
      JSON.parse(fs.readFileSync(path, "utf-8")) as Manifest;
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
    if (args.debug) {
      console.error(e);
    } else {
      console.log("No manifest found in the package");
    }
  }
}
