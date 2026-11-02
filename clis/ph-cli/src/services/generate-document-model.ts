import { loadDocumentModel } from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import {
  extractDocumentModelDocuments,
  getDocument,
  saveSpec,
} from "@powerhousedao/vetra/codegen";
import { handleMutuallyExclusiveOptions } from "@powerhousedao/shared/clis";
import type { DocumentModelDocument } from "@powerhousedao/shared/document-model";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GenerateDocumentModelArgs } from "../types.js";
import { resolveModuleDirName } from "../utils/module-dir.js";
import { warnSubgraphTypeConflicts } from "../utils/warn-subgraph-type-conflicts.js";
import {
  selectDocumentModelGeneration,
  selectScaffoldGeneration,
} from "./definitions/authoring-mode.js";
import { scaffoldCodeFirstDocumentModel } from "./definitions/code-first-scaffold.js";

export async function startGenerateDocumentModel(
  args: GenerateDocumentModelArgs,
  projectDir: string,
) {
  const { document, dir, all, extract, name, debug } = args;
  if (debug) {
    console.log({ args });
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
    const generation = selectScaffoldGeneration(args, projectDir);
    await scaffoldCodeFirstDocumentModel(generation, name, projectDir, project);
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
      await selectDocumentModelGeneration(
        args,
        projectDir,
      ).generateAllDocumentModels(project);
    await project.save();
    if (
      documentModels.length === 0 &&
      unreadableDirs.length === 0 &&
      codeFirstDocumentModels.length === 0
    ) {
      console.log("No document models found in document-models/.");
    }
    for (const { name } of documentModels) {
      console.log(`Regenerated document model "${name}"`);
    }
    for (const { name } of codeFirstDocumentModels) {
      console.log(`Updated the exports of code-first document model "${name}"`);
    }
    for (const dirName of unreadableDirs) {
      console.warn(
        `Skipped document-models/${dirName}: expected a valid document model spec at document-models/${dirName}/${dirName}.json. Kept the manifest's document models.`,
      );
    }
    await warnSubgraphTypeConflicts(projectDir);
    return;
  } else if (document) {
    const generation = selectDocumentModelGeneration(args, projectDir);
    if (document.endsWith(".phd")) {
      const doc = (await getDocument(document)) as DocumentModelDocument;
      await generation.generateDocumentModel(doc.state.global, project);
    } else {
      const state = await loadDocumentModel(document);
      await generation.generateDocumentModel(state, project);
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
    await selectDocumentModelGeneration(args, projectDir).generateDocumentModel(
      state,
      project,
    );
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
