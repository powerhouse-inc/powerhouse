import {
  generateAllDocumentModels,
  generateCodeFirstDocumentModel,
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
  const {
    all,
    codeFirst,
    debug,
    dir,
    document,
    extension,
    extract,
    id,
    name,
    version,
  } = args;
  if (debug) {
    console.log({ args });
  }
  if (codeFirst) {
    if (document || dir || all || extract) {
      throw new Error(
        "--code-first cannot be combined with --document, --dir, --all, or --extract.",
      );
    }
    if (!name || !id) {
      throw new Error("--code-first requires both --name and --id.");
    }
    const project = buildTsMorphProject(projectDir);
    await generateCodeFirstDocumentModel(
      {
        id,
        name,
        ...(extension ? { extension } : {}),
        ...(version === undefined ? {} : { version }),
      },
      project,
    );
    await project.save();
    return;
  }
  if (
    name !== undefined ||
    id !== undefined ||
    extension !== undefined ||
    version !== undefined
  ) {
    throw new Error(
      "--name, --id, --extension, and --version require --code-first.",
    );
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
      "Please specify `--code-first` or one of `document`, `dir`, `all`, or `extract`.",
    );
    return;
  }
  await project.save();
}
