import { type DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import type { ProcessorApps } from "@powerhousedao/shared/processors";
import { kebabCase } from "change-case";
import {
  pruneManifestSection,
  tsMorphGenerateApp,
  tsMorphGenerateDocumentEditor,
  tsMorphGenerateDocumentModel,
  tsMorphGenerateProcessor,
  tsMorphGenerateSubgraph,
} from "file-builders";
import { readdirSync } from "node:fs";
import {
  filter,
  isDefined,
  isIncludedIn,
  isTruthy,
  map,
  pipe,
  prop,
  unique,
} from "remeda";
import type { Project } from "ts-morph";
import {
  getAppMetadata,
  getEditorMetadata,
  getOrCreateDirectory,
  getProcessorMetadata,
  getSubgraphMetadata,
  loadDocumentModelInDir,
} from "utils";
import { loadDocumentModel } from "./utils.js";

export async function generateDocumentModel(
  documentModelState: DocumentModelGlobalState,
  project: Project,
) {
  await tsMorphGenerateDocumentModel(documentModelState, project);
}

/* Runs generate for each document model json file found in the project's `document-models` directory  */
export async function generateAllDocumentModels(project: Project) {
  const { directory: documentModelsDir } = getOrCreateDirectory(
    project,
    "document-models",
  );
  const documentModelsDirPath = documentModelsDir.getPath();
  const projectDir = documentModelsDir.getParentOrThrow().getPath();
  const documentModelStateFiles = pipe(
    readdirSync(documentModelsDirPath, { withFileTypes: true }),
    map(loadDocumentModelInDir),
    filter(isDefined),
  );

  for (const documentModelState of documentModelStateFiles) {
    await generateDocumentModel(documentModelState, project);
  }

  await pruneManifestSection(
    projectDir,
    "documentModels",
    documentModelStateFiles.map((s) => s.id),
  );
}
export async function generateFromFile(filePath: string, project: Project) {
  // load document model spec from file
  const documentModelState = await loadDocumentModel(filePath);

  // delegate to shared generation function
  await generateDocumentModel(documentModelState, project);
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
  const {
    editorName,
    documentTypes,
    editorId: editorIdArg,
    editorDirName,
  } = args;

  if (documentTypes.length > 1) {
    throw new Error("Multiple document types are not supported yet");
  }

  const documentModelId = documentTypes[0];
  const editorId = editorIdArg || kebabCase(editorName);
  const editorDir = editorDirName || kebabCase(editorName);

  await tsMorphGenerateDocumentEditor({
    project,
    editorDir,
    documentModelId,
    editorName,
    editorId,
  });
}

/* Runs generate for all editors found in the project's `editors` directory.
 * Note: we intentionally filter out editors with the document type "powerhouse/document-drive".
 * These are handled separately by the `generateAllApps` function.
 */
export async function generateAllEditors(project: Project) {
  const { directory: editorsDir } = getOrCreateDirectory(project, "editors");
  const projectDir = editorsDir.getParentOrThrow().getPath();

  /* An editor's `id`, `name`, and `documentTypes` args can be found in the `module.ts` file */
  const editorsToAdd = pipe(
    editorsDir.getDirectories(),
    map((dir) => dir.getBaseName()),
    map((dirName) => getEditorMetadata(project, dirName)),
    filter(isTruthy),
    filter(
      ({ documentTypes }) =>
        !isIncludedIn("powerhouse/document-drive", documentTypes),
    ),
  );

  for (const editorToAdd of editorsToAdd) {
    const {
      name: editorName,
      id: editorId,
      dirName: editorDirName,
      documentTypes,
    } = editorToAdd;

    await generateEditor(
      {
        editorName,
        editorId,
        editorDirName,
        documentTypes,
      },
      project,
    );
  }

  await pruneManifestSection(
    projectDir,
    "editors",
    editorsToAdd.map((e) => e.id),
  );
}

type GenerateAppArgs = {
  appName: string;
  appId?: string;
  allowedDocumentTypes?: string[];
  isDragAndDropEnabled?: boolean;
  appDirName?: string;
};
export async function generateApp(args: GenerateAppArgs, project: Project) {
  const {
    appName,
    appId,
    allowedDocumentTypes,
    isDragAndDropEnabled,
    appDirName,
  } = args;

  await tsMorphGenerateApp({
    project,
    editorDir: appDirName || kebabCase(appName),
    editorName: appName,
    editorId: appId ?? kebabCase(appName),
    allowedDocumentModelIds: allowedDocumentTypes ?? [],
    isDragAndDropEnabled: isDragAndDropEnabled ?? true,
  });
}

/* Runs generate for all apps found in the project's `editors` directory.
 * Note: we intentionally filter out editors which do not have the document type "powerhouse/document-drive".
 * These are handled separately by the `generateAllEditors` function.
 */
export async function generateAllApps(project: Project) {
  const { directory: editorsDir } = getOrCreateDirectory(project, "editors");
  const projectDir = editorsDir.getParentOrThrow().getPath();

  /* An editor's `id`, `name`, and `documentTypes` args can be found in the `module.ts` file */
  const appsToAdd = pipe(
    editorsDir.getDirectories(),
    map((dir) => dir.getBaseName()),
    map((dirName) => getAppMetadata(project, dirName)),
    filter(isTruthy),
  );

  for (const appToAdd of appsToAdd) {
    const {
      name: appName,
      id: appId,
      dirName: appDirName,
      allowedDocumentTypes,
      isDragAndDropEnabled,
    } = appToAdd;
    await generateApp(
      {
        appName,
        appDirName,
        appId,
        allowedDocumentTypes,
        isDragAndDropEnabled,
      },
      project,
    );
  }

  await pruneManifestSection(
    projectDir,
    "apps",
    appsToAdd.map((a) => a.id),
  );
}
export async function generateSubgraph(subgraphName: string, project: Project) {
  await tsMorphGenerateSubgraph({ subgraphName, project });
}

/* Runs generate for each directory found in the project's `subgraphs` directory  */
export async function generateAllSubgraphs(project: Project) {
  const { directory: subgraphsDir } = getOrCreateDirectory(
    project,
    "subgraphs",
  );
  const projectDir = subgraphsDir.getParentOrThrow().getPath();
  /* The subgraph's name is found in the `index.ts` file */
  const subgraphNames = pipe(
    subgraphsDir.getDirectories(),
    map((dir) => dir.getBaseName()),
    map((dirName) => getSubgraphMetadata(project, dirName)),
    map(prop("subgraphName")),
    filter(isDefined),
    unique(),
  );
  for (const subgraphName of subgraphNames) {
    await generateSubgraph(subgraphName, project);
  }

  await pruneManifestSection(
    projectDir,
    "subgraphs",
    subgraphNames.map((name) => kebabCase(name)),
  );
}

export async function generateProcessor(
  args: {
    processorName: string;
    processorType: "analytics" | "relationalDb";
    processorApps: ProcessorApps;
    documentTypes: string[];
  },
  project: Project,
) {
  return await tsMorphGenerateProcessor({
    project,
    ...args,
  });
}

/* Runs generate for each directory found in the project's `processors` directory  */
export async function generateAllProcessors(project: Project) {
  const { directory: processorsDir } = getOrCreateDirectory(
    project,
    "processors",
  );
  const projectDir = processorsDir.getParentOrThrow().getPath();
  const processorsToGenerate = pipe(
    processorsDir.getDirectories(),
    map((dir) => dir.getBaseName()),
    map((dirName) => getProcessorMetadata(project, dirName)),
  );

  for (const processorArgs of processorsToGenerate) {
    await generateProcessor(processorArgs, project);
  }

  await pruneManifestSection(
    projectDir,
    "processors",
    processorsToGenerate.map((p) => kebabCase(p.processorName)),
  );
}

/* Runs each module type's generateAll{moduleType} function for the current project */
export async function generateAll(project: Project) {
  await generateAllDocumentModels(project);
  await generateAllEditors(project);
  await generateAllApps(project);
  await generateAllSubgraphs(project);
  await generateAllProcessors(project);
}
