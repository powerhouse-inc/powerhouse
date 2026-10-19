import {
  generateAllSubgraphs,
  generateSubgraph,
  installFeatureDependencies,
} from "@powerhousedao/codegen";
import {
  buildTsMorphProject,
  getSubgraphMetadata,
} from "@powerhousedao/codegen/utils";
import {
  extractSubgraphDocuments,
  generateSubgraphFromDocument,
  getDocument,
  saveSpec,
} from "@powerhousedao/vetra/codegen";
import type { SubgraphModuleDocument } from "@powerhousedao/vetra/document-models/subgraph-module";
import { basename } from "node:path";
import type { GenerateSubgraphArgs } from "../types.js";
import { checkSubgraphTypes } from "../utils/check-subgraph-types.js";

export async function startGenerateSubgraph(
  args: GenerateSubgraphArgs,
  projectDir: string,
) {
  const { name, document, dir, all, extract, debug } = args;
  if (debug) {
    console.log({ args });
  }

  const project = buildTsMorphProject(projectDir);
  if (extract) {
    const docs = extractSubgraphDocuments(project);
    for (const doc of docs) {
      const path = await saveSpec(doc, projectDir);
      console.log(`Wrote ${path}`);
    }
    return;
  }
  const beforeCheck = async () => {
    await project.save();
    await installFeatureDependencies(projectDir, {
      skipInstall: args.skipInstall,
    });
  };
  if (all) {
    await generateAllSubgraphs(project, { beforeCheck });
  } else if (document) {
    const doc = (await getDocument(document)) as SubgraphModuleDocument;
    await generateSubgraphFromDocument(doc, project, { beforeCheck });
  } else if (name?.trim()) {
    await generateSubgraph(name.trim(), project, { beforeCheck });
  } else if (dir) {
    const { problem } = getSubgraphMetadata(project, basename(dir));
    if (problem !== undefined) throw new Error(problem);
    await generateAllSubgraphs(project, { beforeCheck });
  } else {
    console.log(
      "Please specify one of `name`, `document`, `dir`, `all`, or `extract`.",
    );
    return;
  }
  await project.save();
  await checkSubgraphTypes(projectDir);
}
