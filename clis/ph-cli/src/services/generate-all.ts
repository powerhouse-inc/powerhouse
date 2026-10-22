import { generateAll } from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { extractAllDocuments, saveSpec } from "@powerhousedao/vetra/codegen";
import { probeHostsFolder } from "@powerhousedao/host-core";
import { isUniformRunnersEnabled } from "../utils/feature-flags.js";
import { warnSubgraphTypeConflicts } from "../utils/warn-subgraph-type-conflicts.js";
import { startGenerateHosts } from "./generate-hosts.js";

export async function startGenerateAll(
  args: { extract?: boolean },
  projectDir: string,
) {
  const project = buildTsMorphProject(projectDir);
  if (args.extract) {
    const all = extractAllDocuments(project);
    for (const doc of [
      ...all.documentModels,
      ...all.editors,
      ...all.processors,
      ...all.subgraphs,
      ...all.apps,
    ]) {
      const path = await saveSpec(doc, projectDir);
      console.log(`Wrote ${path}`);
    }
    return;
  }
  await generateAll(project);
  await project.save();
  await warnSubgraphTypeConflicts(projectDir);
  if (
    isUniformRunnersEnabled() &&
    probeHostsFolder(projectDir).kind === "present" &&
    !(await startGenerateHosts(projectDir))
  ) {
    process.exitCode = 1;
  }
}
