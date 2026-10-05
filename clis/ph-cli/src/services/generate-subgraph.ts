import {
  detectFeatures,
  generateAllSubgraphs,
  generateCodeFirstSubgraph,
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
import { handleMutuallyExclusiveOptions } from "@powerhousedao/shared/clis";
import type { SubgraphModuleDocument } from "@powerhousedao/vetra/document-models/subgraph-module";
import { dirname } from "node:path";
import type { GenerateSubgraphArgs } from "../types.js";
import { logCodeFirstResult } from "./code-first-result.js";
import { installAddedDependencies } from "../utils/install-added-dependencies.js";

export async function startGenerateSubgraph(
  args: GenerateSubgraphArgs,
  projectDir: string,
) {
  const { name, document, dir, all, extract, codeFirst, debug } = args;
  if (debug) {
    console.log({ args });
  }

  if (codeFirst) {
    handleMutuallyExclusiveOptions(
      {
        "--code-first": true,
        "--document": document,
        "--dir": dir,
        "--all": all || undefined,
        "--extract": extract || undefined,
      },
      "generation mode",
    );
    if (name === undefined || name.trim() === "") {
      throw new Error("--code-first needs --name.");
    }
    const project = buildTsMorphProject(projectDir);
    const result = await generateCodeFirstSubgraph(name.trim(), project);
    await project.save();
    logCodeFirstResult(result, "subgraph");
    return;
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
  const added = await syncFeatureDependencies(
    detectFeatures(projectDir),
    projectDir,
  );
  await installAddedDependencies(added, projectDir, args.skipInstall);
}
