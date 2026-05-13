import {
  detectFeatures,
  generateAllSubgraphs,
  generateSubgraph,
  syncFeatureDependencies,
} from "@powerhousedao/codegen";
import {
  buildTsMorphProject,
  getSubgraphMetadata,
} from "@powerhousedao/codegen/utils";
import { dirname } from "node:path";
import type { GenerateSubgraphArgs } from "../types.js";

export async function startGenerateSubgraph(
  args: GenerateSubgraphArgs,
  projectDir: string,
) {
  const { name, dir, all, debug } = args;
  if (debug) {
    console.log({ args });
  }
  const project = buildTsMorphProject(projectDir);
  if (all) {
    await generateAllSubgraphs(project);
  } else if (name) {
    await generateSubgraph(name, project);
  } else if (dir) {
    const { subgraphName } = getSubgraphMetadata(project, dirname(dir));
    if (!subgraphName) {
      throw new Error(`Failed to get data for subgraph in dir "${dir}"`);
    }
    await generateSubgraph(subgraphName, project);
  } else {
    console.log("Please specify either `name`, `dir`, or `all`.");
    return;
  }
  await project.save();
  await syncFeatureDependencies(detectFeatures(projectDir), projectDir);
}
