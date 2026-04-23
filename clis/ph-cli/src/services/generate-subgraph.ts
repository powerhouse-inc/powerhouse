import { generateAllSubgraphs, generateSubgraph } from "@powerhousedao/codegen";
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
    const subgraphArgs = getSubgraphMetadata(project, dirname(dir));
    if (!subgraphArgs) {
      throw new Error(`Failed to get data for subgraph in dir "${dir}"`);
    }
    const { subgraphName } = subgraphArgs;
    await generateSubgraph(subgraphName, project);
  } else {
    console.log("Please specify either `name`, `dir`, or `all`.");
  }
}
