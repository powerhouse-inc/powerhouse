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
  findSubgraphNameConflict,
  generateSubgraphFromDocument,
  getDocument,
  saveSpec,
} from "@powerhousedao/vetra/codegen";
import type { SubgraphModuleDocument } from "@powerhousedao/vetra/document-models/subgraph-module";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GenerateSubgraphArgs } from "../types.js";
import { installAddedDependencies } from "../utils/install-added-dependencies.js";
import { resolveModuleDirName } from "../utils/module-dir.js";
import { warnSubgraphTypeConflicts } from "../utils/warn-subgraph-type-conflicts.js";

const INDEX_FILE_EXPECTATION =
  "a class extending BaseSubgraph with a string literal `name`";

async function assertSubgraphNameFree(projectDir: string, name: string) {
  const conflict = await findSubgraphNameConflict(projectDir, name);
  if (conflict) throw new Error(conflict);
}

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
    if (docs.length === 0) {
      console.log("No subgraphs found in subgraphs/.");
    }
    for (const doc of docs) {
      const path = await saveSpec(doc, projectDir);
      console.log(`Wrote ${path}`);
    }
    return;
  }
  const report: string[] = [];
  if (all) {
    const { subgraphNames, unreadableDirs } =
      await generateAllSubgraphs(project);
    if (subgraphNames.length === 0 && unreadableDirs.length === 0) {
      report.push("No subgraphs found in subgraphs/.");
    }
    for (const subgraphName of subgraphNames) {
      report.push(`Regenerated subgraph "${subgraphName}"`);
    }
    for (const dirName of unreadableDirs) {
      console.warn(
        `Skipped subgraphs/${dirName}: expected its index.ts to export ${INDEX_FILE_EXPECTATION}. Kept the manifest's subgraphs.`,
      );
    }
  } else if (document) {
    const doc = (await getDocument(document)) as SubgraphModuleDocument;
    await assertSubgraphNameFree(projectDir, doc.state.global.name);
    await generateSubgraphFromDocument(doc, project);
  } else if (name) {
    await assertSubgraphNameFree(projectDir, name);
    await generateSubgraph(name, project);
  } else if (dir) {
    const dirName = resolveModuleDirName(
      projectDir,
      "subgraphs",
      dir,
      "my-subgraph",
    );
    if (!existsSync(join(projectDir, "subgraphs", dirName, "index.ts"))) {
      throw new Error(`subgraphs/${dirName} has no index.ts.`);
    }
    const { subgraphName } = getSubgraphMetadata(project, dirName);
    if (!subgraphName) {
      throw new Error(
        `Could not read subgraphs/${dirName}/index.ts: expected ${INDEX_FILE_EXPECTATION}.`,
      );
    }
    await generateSubgraph(subgraphName, project);
    report.push(`Regenerated subgraph "${subgraphName}"`);
  } else {
    console.log(
      "Please specify one of `name`, `document`, `dir`, `all`, or `extract`.",
    );
    return;
  }
  await project.save();
  for (const line of report) {
    console.log(line);
  }
  await warnSubgraphTypeConflicts(projectDir);
  const added = await syncFeatureDependencies(
    detectFeatures(projectDir),
    projectDir,
  );
  await installAddedDependencies(added, projectDir, args.skipInstall);
}
