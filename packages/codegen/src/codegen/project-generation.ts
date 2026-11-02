import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import type { Project } from "ts-morph";
import { projectPath } from "../utils/source-files.js";
import { projectModelGeneration } from "./model-generation.js";
import { loadDocumentModel } from "./utils.js";

export async function generateDocumentModel(
  documentModelState: DocumentModelGlobalState,
  project: Project,
) {
  await projectModelGeneration(project).generateDocumentModel(
    documentModelState,
    project,
  );
}

export async function generateAllDocumentModels(project: Project) {
  const { documentModels, unreadableDirs } =
    await projectModelGeneration(project).generateAllDocumentModels(project);
  return { documentModels, unreadableDirs };
}

type GenerateEditorArgs = {
  editorName: string;
  documentTypes: string[];
  editorId?: string;
  editorDirName?: string;
};

export async function generateEditor(
  args: GenerateEditorArgs,
  project: Project,
) {
  await projectModelGeneration(project).generateEditor(args, project);
}

export async function generateAllEditors(project: Project) {
  const { editors, unreadableDirs } =
    await projectModelGeneration(project).generateAllEditors(project);
  return { editors, unreadableDirs };
}

export async function generateAll(project: Project) {
  await projectModelGeneration(project).generateAll(project);
}

export async function generateFromFile(filePath: string, project: Project) {
  const state = await loadDocumentModel(projectPath(project, filePath));
  await projectModelGeneration(project).generateDocumentModel(state, project);
}
