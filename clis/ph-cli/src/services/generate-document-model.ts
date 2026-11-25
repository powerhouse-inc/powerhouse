import { loadDocumentModel, modelGeneration } from "@powerhousedao/codegen";
import {
  buildTsMorphProject,
  documentModelsDirOf,
} from "@powerhousedao/codegen/utils";
import { handleMutuallyExclusiveOptions } from "@powerhousedao/shared/clis";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { GenerateDocumentModelArgs } from "../types.js";
import { resolveModuleDirName } from "../utils/module-dir.js";
import { warnSubgraphTypeConflicts } from "../utils/warn-subgraph-type-conflicts.js";
import { scaffoldCodeFirstDocumentModel } from "./definitions/code-first-scaffold.js";

/** The configured documentModelsDir, package-relative, for messages and paths. */
function modelsDirOf(projectDir: string) {
  return relative(projectDir, documentModelsDirOf(projectDir).path).replaceAll(
    "\\",
    "/",
  );
}

export async function startGenerateDocumentModel(
  args: GenerateDocumentModelArgs,
  projectDir: string,
) {
  const { dir, all, name, debug } = args;
  if (debug) {
    console.log({ args });
  }
  const project = buildTsMorphProject(projectDir);
  if (name !== undefined) {
    handleMutuallyExclusiveOptions(
      {
        "--name": name,
        "--dir": dir,
        "--all": all || undefined,
      },
      "generation mode",
    );
    await scaffoldCodeFirstDocumentModel(
      modelGeneration,
      name,
      projectDir,
      project,
    );
    return;
  }
  if (all) {
    const { documentModels, unreadableDirs, codeFirstDocumentModels } =
      await modelGeneration.generateAllDocumentModels(project);
    await project.save();
    if (
      documentModels.length === 0 &&
      unreadableDirs.length === 0 &&
      codeFirstDocumentModels.length === 0
    ) {
      console.log(`No document models found in ${modelsDirOf(projectDir)}/.`);
    }
    for (const { name } of documentModels) {
      console.log(`Regenerated document model "${name}"`);
    }
    for (const { name } of codeFirstDocumentModels) {
      console.log(`Updated the exports of document model "${name}"`);
    }
    for (const dirName of unreadableDirs) {
      console.warn(
        `Skipped ${modelsDirOf(projectDir)}/${dirName}: it has no readable ${dirName}.json, and no index.ts in it exports a document model with a definition. Kept the manifest's document models.`,
      );
    }
    await warnSubgraphTypeConflicts(projectDir);
    return;
  }
  if (dir) {
    const modelsDir = modelsDirOf(projectDir);
    const dirName = resolveModuleDirName(
      projectDir,
      modelsDir,
      dir,
      "my-document-model",
    );
    const specPath = join(projectDir, modelsDir, dirName, `${dirName}.json`);
    if (!existsSync(specPath)) {
      throw new Error(`${modelsDir}/${dirName} has no ${dirName}.json.`);
    }
    const state = await loadDocumentModel(specPath);
    await modelGeneration.generateDocumentModel(state, project);
    await project.save();
    console.log(
      `Regenerated document model "${state.name}" in ${modelsDir}/${dirName}`,
    );
    await warnSubgraphTypeConflicts(projectDir);
    return;
  }
  console.log("Please specify one of `name`, `dir`, or `all`.");
}
