import { modelGeneration } from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { probeHostsFolder } from "@powerhousedao/host-core";
import { warnSubgraphTypeConflicts } from "../utils/warn-subgraph-type-conflicts.js";
import { startGenerateHosts } from "./generate-hosts.js";

export async function startGenerateAll(projectDir: string) {
  const project = buildTsMorphProject(projectDir);
  await modelGeneration.generateAll(project);
  await project.save();
  await warnSubgraphTypeConflicts(projectDir);
  if (
    probeHostsFolder(projectDir).kind === "present" &&
    !(await startGenerateHosts(projectDir))
  ) {
    process.exitCode = 1;
  }
}
