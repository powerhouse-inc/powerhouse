import { loadDocumentModel, modelGeneration } from "@powerhousedao/codegen";
import {
  buildTsMorphProject,
  documentModelsDirOf,
} from "@powerhousedao/codegen/utils";
import {
  extractDocumentModelDocuments,
  getDocument,
  saveSpec,
} from "@powerhousedao/vetra/codegen";
import { handleMutuallyExclusiveOptions } from "@powerhousedao/shared/clis";
import type { DocumentModelDocument } from "@powerhousedao/shared/document-model";
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
  const { document, dir, all, extract, name, codeFirst, debug } = args;
  if (debug) {
    console.log({ args });
  }
  if (name !== undefined && !codeFirst) {
    throw new Error(
      "--name creates a code-first document model. Pass --code-first.",
    );
  }
  if (codeFirst && name === undefined) {
    throw new Error(
      "--code-first only chooses how --name creates a model. Existing models of both styles are discovered without it; drop --code-first.",
    );
  }
  const project = buildTsMorphProject(projectDir);
  if (name !== undefined) {
    handleMutuallyExclusiveOptions(
      {
        "--name": name,
        "--document": document,
        "--dir": dir,
        "--all": all || undefined,
        "--extract": extract || undefined,
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
  if (extract) {
    const docs = extractDocumentModelDocuments(project);
    for (const doc of docs) {
      const path = await saveSpec(doc, projectDir);
      console.log(`Wrote ${path}`);
    }
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
      console.log(`Updated the exports of code-first document model "${name}"`);
    }
    for (const dirName of unreadableDirs) {
      console.warn(
        `Skipped ${modelsDirOf(projectDir)}/${dirName}: it has no readable ${dirName}.json, and no index.ts in it exports a code-first model. Kept the manifest's document models.`,
      );
    }
    await warnSubgraphTypeConflicts(projectDir);
    return;
  } else if (document) {
    if (document.endsWith(".phd")) {
      const doc = (await getDocument(document)) as DocumentModelDocument;
      await modelGeneration.generateDocumentModel(doc.state.global, project);
    } else {
      const state = await loadDocumentModel(document);
      await modelGeneration.generateDocumentModel(state, project);
    }
  } else if (dir) {
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
  } else {
    console.log(
      "Please specify one of `document`, `dir`, `all`, or `extract`.",
    );
    return;
  }
  await project.save();
  await warnSubgraphTypeConflicts(projectDir);
}
