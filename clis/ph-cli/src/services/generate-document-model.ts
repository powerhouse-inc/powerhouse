import {
  generateAllDocumentModels,
  generateDocumentModel,
  loadDocumentModel,
} from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import {
  extractDocumentModelDocuments,
  generateDocumentModelFromDocument,
  getDocument,
  saveSpec,
} from "@powerhousedao/vetra/codegen";
import type { DocumentModelDocument } from "@powerhousedao/shared/document-model";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GenerateDocumentModelArgs } from "../types.js";
import { resolveModuleDirName } from "../utils/module-dir.js";
import { warnSubgraphTypeConflicts } from "../utils/warn-subgraph-type-conflicts.js";

export async function startGenerateDocumentModel(
  args: GenerateDocumentModelArgs,
  projectDir: string,
) {
  const { document, dir, all, extract, debug } = args;
  if (debug) {
    console.log({ args });
  }
  const project = buildTsMorphProject(projectDir);
  if (extract) {
    const docs = extractDocumentModelDocuments(project);
    for (const doc of docs) {
      const path = await saveSpec(doc, projectDir);
      console.log(`Wrote ${path}`);
    }
    return;
  }
  if (all) {
    const { documentModels, unreadableDirs } =
      await generateAllDocumentModels(project);
    await project.save();
    if (documentModels.length === 0 && unreadableDirs.length === 0) {
      console.log("No document models found in document-models/.");
    }
    for (const { name } of documentModels) {
      console.log(`Regenerated document model "${name}"`);
    }
    for (const dirName of unreadableDirs) {
      console.warn(
        `Skipped document-models/${dirName}: expected a valid document model spec at document-models/${dirName}/${dirName}.json. Kept the manifest's document models.`,
      );
    }
    await warnSubgraphTypeConflicts(projectDir);
    return;
  } else if (document) {
    if (document.endsWith(".phd")) {
      const doc = (await getDocument(document)) as DocumentModelDocument;
      await generateDocumentModelFromDocument(doc, project);
    } else {
      const state = await loadDocumentModel(document);
      await generateDocumentModel(state, project);
    }
  } else if (dir) {
    const dirName = resolveModuleDirName(
      projectDir,
      "document-models",
      dir,
      "my-document-model",
    );
    const specPath = join(
      projectDir,
      "document-models",
      dirName,
      `${dirName}.json`,
    );
    if (!existsSync(specPath)) {
      throw new Error(`document-models/${dirName} has no ${dirName}.json.`);
    }
    const state = await loadDocumentModel(specPath);
    await generateDocumentModel(state, project);
    await project.save();
    console.log(
      `Regenerated document model "${state.name}" in document-models/${dirName}`,
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
