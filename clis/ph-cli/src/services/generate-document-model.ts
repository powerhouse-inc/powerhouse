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
import { handleMutuallyExclusiveOptions } from "@powerhousedao/shared/clis";
import type { DocumentModelDocument } from "@powerhousedao/shared/document-model";
import { kebabCase } from "change-case";
import { readPackage } from "read-pkg";
import { dirname, join } from "node:path";
import type { GenerateDocumentModelArgs } from "../types.js";
import { logCodeFirstResult } from "./code-first-result.js";

export async function startGenerateDocumentModel(
  args: GenerateDocumentModelArgs,
  projectDir: string,
) {
  const { document, dir, all, extract, codeFirst, debug } = args;
  if (debug) {
    console.log({ args });
  }

  if (codeFirst !== undefined) {
    handleMutuallyExclusiveOptions(
      {
        "--code-first": codeFirst,
        "--extract": extract || undefined,
        "--all": all || undefined,
        "--document": document,
        "--dir": dir,
      },
      "generation mode",
    );
    await createCodeFirstDocumentModel(codeFirst, projectDir);
    return;
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

async function createCodeFirstDocumentModel(
  name: string,
  projectDir: string,
): Promise<void> {
  const trimmed = name.trim();
  if (trimmed === "") {
    throw new Error("--code-first needs a model name.");
  }

  const namespace = await documentTypeNamespace(projectDir);
  const project = buildTsMorphProject(projectDir);
  const result = await generateCodeFirstDocumentModel(
    {
      name: trimmed,
      documentType: `${namespace}/${kebabCase(trimmed)}`,
      author: { name: namespace, website: null },
    },
    project,
  );
  await project.save();
  logCodeFirstResult(result, "model");
}

async function documentTypeNamespace(projectDir: string): Promise<string> {
  const { name } = await readPackage({ cwd: projectDir, normalize: false });
  if (name === undefined || name === "") {
    throw new Error(
      "--code-first namespaces the document type under the package name. Add a name to package.json.",
    );
  }
  return name.replace(/^@/, "").replace(/\//g, "-");
}
