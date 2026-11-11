import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import type { Project } from "ts-morph";
import { projectPath } from "../utils/source-files.js";
import { modelGeneration } from "./document-model-generation.js";
import { generateNamedSubgraph } from "./subgraph-generation.js";
import { loadDocumentModel } from "./utils.js";

export async function generateDocumentModel(
  documentModelState: DocumentModelGlobalState,
  project: Project,
) {
  await modelGeneration.generateDocumentModel(documentModelState, project);
}

export async function generateAllDocumentModels(project: Project) {
  const { documentModels, unreadableDirs } =
    await modelGeneration.generateAllDocumentModels(project);
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
  await modelGeneration.generateEditor(args, project);
}

export async function generateAllEditors(project: Project) {
  const { editors, unreadableDirs } =
    await modelGeneration.generateAllEditors(project);
  return { editors, unreadableDirs };
}

export async function generateAll(project: Project) {
  await modelGeneration.generateAll(project);
}

export async function generateFromFile(filePath: string, project: Project) {
  const state = await loadDocumentModel(projectPath(project, filePath));
  await modelGeneration.generateDocumentModel(state, project);
}

/** @experimental `codeFirst` writes a new subgraph code first; without it,
 * a new subgraph is schema first. */
export type GenerateSubgraphOptions = {
  readonly codeFirst?: boolean;
};

/** Generates a subgraph. An existing `subgraphs/<kebab-case name>` keeps its
 * own style; `codeFirst` applies only to a new one. */
export async function generateSubgraph(
  subgraphName: string,
  project: Project,
  options: GenerateSubgraphOptions = {},
) {
  await generateNamedSubgraph(subgraphName, project, options);
}
