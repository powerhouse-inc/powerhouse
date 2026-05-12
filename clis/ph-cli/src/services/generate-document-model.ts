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
import { dirname, join } from "node:path";
import type { GenerateDocumentModelArgs } from "../types.js";

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
    await generateAllDocumentModels(project);
  } else if (document) {
    if (document.endsWith(".phd")) {
      const doc = (await getDocument(document)) as DocumentModelDocument;
      await generateDocumentModelFromDocument(doc, project);
    } else {
      const state = await loadDocumentModel(document);
      await generateDocumentModel(state, project);
    }
  } else if (dir) {
    const documentModelDirName = dirname(dir);
    const documentModelFileName = `${documentModelDirName}.json`;
    const documentModelFilePath = join(dir, documentModelFileName);
    const state = await loadDocumentModel(documentModelFilePath);
    await generateDocumentModel(state, project);
  } else {
    console.log(
      "Please specify one of `document`, `dir`, `all`, or `extract`.",
    );
    return;
  }
  await project.save();
}
