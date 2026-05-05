import {
  generateAllDocumentModels,
  generateDocumentModel,
  loadDocumentModel,
} from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { dirname, join } from "node:path";
import type { GenerateDocumentModelArgs } from "../types.js";

export async function startGenerateDocumentModel(
  args: GenerateDocumentModelArgs,
  projectDir: string,
) {
  const { file, dir, all, debug } = args;
  if (debug) {
    console.log({ args });
  }
  const project = buildTsMorphProject(projectDir);
  if (all) {
    await generateAllDocumentModels(project);
  } else if (file) {
    const documentModelState = await loadDocumentModel(file);
    await generateDocumentModel(documentModelState, project);
  } else if (dir) {
    const documentModelDirName = dirname(dir);
    const documentModelFileName = `${documentModelDirName}.json`;
    const documentModelFilePath = join(dir, documentModelFileName);
    const documentModelState = await loadDocumentModel(documentModelFilePath);
    await generateDocumentModel(documentModelState, project);
  } else {
    console.log("Please specify either `file`, `dir`, or `all`.");
    return;
  }
  await project.save();
}
