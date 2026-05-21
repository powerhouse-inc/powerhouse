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
import {
  extractSubgraphDocuments,
  generateSubgraphFromDocument,
  getDocument,
  saveSpec,
} from "@powerhousedao/vetra/codegen";
import type { SubgraphModuleDocument } from "@powerhousedao/vetra/document-models/subgraph-module";
import { dirname } from "node:path";
import type { GenerateSubgraphArgs } from "../types.js";

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
  if (all) {
    await generateAllSubgraphs(project);
  } else if (document) {
    const doc = (await getDocument(document)) as SubgraphModuleDocument;
    await generateSubgraphFromDocument(doc, project);
  } else if (name) {
    await generateSubgraph(name, project);
  } else if (dir) {
    const { subgraphName } = getSubgraphMetadata(project, dirname(dir));
    if (!subgraphName) {
      throw new Error(`Failed to get data for subgraph in dir "${dir}"`);
    }
    await generateSubgraph(subgraphName, project);
  } else {
    console.log(
      "Please specify one of `name`, `document`, `dir`, `all`, or `extract`.",
    );
    return;
  }
  await project.save();
  await syncFeatureDependencies(detectFeatures(projectDir), projectDir);
}
