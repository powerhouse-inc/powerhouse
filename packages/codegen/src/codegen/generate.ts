import { type DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import type { ProcessorApps } from "@powerhousedao/shared/processors";
import { kebabCase } from "change-case";
import type {
  PieceAuthKind,
  PieceRequireReactor,
  PieceTriggerStrategy,
} from "file-builders";
import {
  getPieceNames,
  pruneManifestSection,
  syncPiecesRegistration,
  syncProjectAiToolsExport,
  tsMorphGenerateApp,
  tsMorphGenerateDocumentEditor,
  tsMorphGenerateDocumentModel,
  tsMorphGeneratePiece,
  tsMorphGeneratePieceAction,
  tsMorphGeneratePieceTrigger,
  tsMorphGenerateProcessor,
  tsMorphGenerateSubgraph,
} from "file-builders";
import { derivePieceId } from "name-builders";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readPackage } from "read-pkg";
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
  getEditorDirNames,
  getEditorMetadata,
  getNonProcessorDirNames,
  getOrCreateDirectory,
  getProcessorDirNames,
  getProcessorMetadata,
  getSubgraphDirNames,
  getSubgraphMetadata,
  loadDocumentModelInDir,
  projectPath,
  readPiecesList,
} from "utils";
import { loadDocumentModel } from "./utils.js";

export async function generateDocumentModel(
  documentModelState: DocumentModelGlobalState,
  project: Project,
) {
  await tsMorphGenerateDocumentModel(documentModelState, project);
}

/* Runs generate for each document model json file found in the project's `document-models` directory.
 * Returns the document models it regenerated, and the directories without a readable `<dir>.json`.
 */
export async function generateAllDocumentModels(project: Project) {
  const { directory: documentModelsDir } = getOrCreateDirectory(
    project,
    "document-models",
  );
  const documentModelsDirPath = documentModelsDir.getPath();
  const projectDir = documentModelsDir.getParentOrThrow().getPath();
  const dirents = existsSync(documentModelsDirPath)
    ? readdirSync(documentModelsDirPath, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const loaded = dirents.map((dirent) => ({
    dirName: dirent.name,
    state: loadDocumentModelInDir(dirent),
  }));
  const unreadableDirs = loaded
    .filter(({ state }) => state === undefined)
    .map(prop("dirName"));
  const documentModels = pipe(loaded, map(prop("state")), filter(isDefined));

  for (const documentModelState of documentModels) {
    await generateDocumentModel(documentModelState, project);
  }

  // An unreadable spec may be a document model's, so its manifest entry stays.
  if (unreadableDirs.length === 0) {
    await pruneManifestSection(
      projectDir,
      "documentModels",
      documentModels.map((s) => s.id),
    );
  }
  return { documentModels, unreadableDirs };
}
export async function generateFromFile(filePath: string, project: Project) {
  // load document model spec from file
  const documentModelState = await loadDocumentModel(
    projectPath(project, filePath),
  );

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
 * Returns the editors it regenerated, and the directories whose `module.ts` it could not read.
 */
export async function generateAllEditors(project: Project) {
  const { directory: editorsDir } = getOrCreateDirectory(project, "editors");
  const projectDir = editorsDir.getParentOrThrow().getPath();
  const dirNames = getEditorDirNames(project);

  /* An editor's `id`, `name`, and `documentTypes` args can be found in the `module.ts` file */
  const unreadableDirs = dirNames.filter(
    (dirName) => !getEditorMetadata(project, dirName),
  );
  const editors = pipe(
    dirNames,
    map((dirName) => getEditorMetadata(project, dirName)),
    filter(isTruthy),
    filter(
      ({ documentTypes }) =>
        !isIncludedIn("powerhouse/document-drive", documentTypes),
    ),
  );

  for (const editor of editors) {
    const {
      name: editorName,
      id: editorId,
      dirName: editorDirName,
      documentTypes,
    } = editor;

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

  // An unreadable module.ts may be an editor's, so its manifest entry stays.
  if (unreadableDirs.length === 0) {
    await pruneManifestSection(
      projectDir,
      "editors",
      editors.map((e) => e.id),
    );
  }
  return { editors, unreadableDirs };
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
 * Returns the apps it regenerated, and the directories whose `module.ts` it could not read.
 */
export async function generateAllApps(project: Project) {
  const { directory: editorsDir } = getOrCreateDirectory(project, "editors");
  const projectDir = editorsDir.getParentOrThrow().getPath();
  const dirNames = getEditorDirNames(project);

  /* An editor's `id`, `name`, and `documentTypes` args can be found in the `module.ts` file */
  const unreadableDirs = dirNames.filter(
    (dirName) => !getEditorMetadata(project, dirName),
  );
  const apps = pipe(
    dirNames,
    map((dirName) => getAppMetadata(project, dirName)),
    filter(isTruthy),
  );

  for (const app of apps) {
    const {
      name: appName,
      id: appId,
      dirName: appDirName,
      allowedDocumentTypes,
      isDragAndDropEnabled,
    } = app;
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

  // An unreadable module.ts may be an app's, so its manifest entry stays.
  if (unreadableDirs.length === 0) {
    await pruneManifestSection(
      projectDir,
      "apps",
      apps.map((a) => a.id),
    );
  }
  return { apps, unreadableDirs };
}
export async function generateSubgraph(subgraphName: string, project: Project) {
  await tsMorphGenerateSubgraph({ subgraphName, project });
}

/* Runs generate for each directory found in the project's `subgraphs` directory.
 * Returns the subgraphs it regenerated, and the directories whose `index.ts` it could not read.
 */
export async function generateAllSubgraphs(project: Project) {
  const { directory: subgraphsDir } = getOrCreateDirectory(
    project,
    "subgraphs",
  );
  const projectDir = subgraphsDir.getParentOrThrow().getPath();
  const dirNames = getSubgraphDirNames(project);
  /* The subgraph's name is found in the `index.ts` file */
  const subgraphs = dirNames.map((dirName) => ({
    dirName,
    ...getSubgraphMetadata(project, dirName),
  }));
  const unreadableDirs = subgraphs
    .filter(({ subgraphName }) => subgraphName === undefined)
    .map(prop("dirName"));
  const subgraphNames = pipe(
    subgraphs,
    map(prop("subgraphName")),
    filter(isDefined),
    unique(),
  );
  for (const subgraphName of subgraphNames) {
    await generateSubgraph(subgraphName, project);
  }

  // An unreadable index.ts may be a subgraph's, so its manifest entry stays.
  if (unreadableDirs.length === 0) {
    await pruneManifestSection(
      projectDir,
      "subgraphs",
      subgraphNames.map((name) => kebabCase(name)),
    );
  }
  return { subgraphNames, unreadableDirs };
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

/* Runs generate for each processor found in the project's `processors` directory.
 * Folders that hold no processor, such as shared helpers, are left alone. */
export async function generateAllProcessors(project: Project) {
  const { directory: processorsDir } = getOrCreateDirectory(
    project,
    "processors",
  );
  const projectDir = processorsDir.getParentOrThrow().getPath();
  for (const dirName of getNonProcessorDirNames(project)) {
    console.warn(
      `[codegen] processors/${dirName} is not a processor (no processor.ts or *FactoryBuilder export, not registered in processors/connect.ts or switchboard.ts); left as it is`,
    );
  }
  const processorsToGenerate = getProcessorDirNames(project).map((dirName) =>
    getProcessorMetadata(project, dirName),
  );

  for (const processorArgs of processorsToGenerate) {
    await generateProcessor(processorArgs, project);
  }

  await pruneManifestSection(
    projectDir,
    "processors",
    processorsToGenerate.map((p) => kebabCase(p.processorName)),
  );
  return processorsToGenerate;
}

function piecesProjectDir(project: Project) {
  const { directory } = getOrCreateDirectory(project, "pieces");
  return directory.getParentOrThrow().getPath();
}

// Tolerant of a project with no package.json: `generateAll` runs over whatever
// is on disk, and only a piece id derived from the package name needs it.
async function readProjectPackage(project: Project) {
  const projectDir = piecesProjectDir(project);
  try {
    const pkg = await readPackage({ cwd: projectDir, normalize: false });
    return { projectDir, packageName: pkg.name ?? "" };
  } catch {
    return { projectDir, packageName: "" };
  }
}

// The directory under pieces/ a part is being added to; a project with one
// piece needs no flag, and with more than one the choice is the user's.
function resolvePieceDir(project: Project, pieceDir?: string): string {
  const { directory: piecesDir } = getOrCreateDirectory(project, "pieces");
  project.addSourceFilesAtPaths(join(piecesDir.getPath(), "*", "index.ts"));
  const dirNames = piecesDir
    .getDirectories()
    .filter((directory) => directory.getSourceFile("index.ts") !== undefined)
    .map((directory) => directory.getBaseName());
  if (pieceDir !== undefined) {
    const kebabCaseDir = kebabCase(pieceDir);
    if (!dirNames.includes(kebabCaseDir)) {
      throw new Error(
        `No piece in pieces/${kebabCaseDir}. This project ships: ${dirNames.join(", ") || "none"}`,
      );
    }
    return kebabCaseDir;
  }
  if (dirNames.length === 1) return dirNames[0];
  if (dirNames.length === 0) {
    throw new Error(
      "This project ships no piece yet. Run `ph generate piece <name>` first.",
    );
  }
  throw new Error(
    `This project ships more than one piece; pass --piece <${dirNames.join("|")}>.`,
  );
}

export async function generatePiece(
  args: {
    pieceName: string;
    pieceId?: string;
    auth?: PieceAuthKind;
    description?: string;
  },
  project: Project,
) {
  const { packageName } = await readProjectPackage(project);
  const names = getPieceNames(args.pieceName);
  if (args.pieceId === undefined && packageName === "") {
    throw new Error(
      "Cannot derive a piece id: this project's package.json has no name. Pass --id.",
    );
  }
  const pieceId =
    args.pieceId ??
    derivePieceId({
      packageName,
      slug: names.kebabCaseName,
      hasOtherPieces: readPiecesList(project).length > 0,
    }).id;
  await tsMorphGeneratePiece({
    project,
    pieceName: args.pieceName,
    pieceId,
    auth: args.auth ?? "custom",
    description: args.description ?? `Connect to ${names.displayName}.`,
  });
}

export async function generatePieceAction(
  args: {
    pieceDir?: string;
    actionName: string;
    requireReactor?: PieceRequireReactor;
  },
  project: Project,
) {
  await tsMorphGeneratePieceAction({
    project,
    pieceDir: resolvePieceDir(project, args.pieceDir),
    actionName: args.actionName,
    requireReactor: args.requireReactor,
  });
}

export async function generatePieceTrigger(
  args: {
    pieceDir?: string;
    triggerName: string;
    strategy?: PieceTriggerStrategy;
    requireReactor?: PieceRequireReactor;
  },
  project: Project,
) {
  await tsMorphGeneratePieceTrigger({
    project,
    pieceDir: resolvePieceDir(project, args.pieceDir),
    triggerName: args.triggerName,
    strategy: args.strategy ?? "polling",
    requireReactor: args.requireReactor,
  });
}

/* Re-registers every piece on disk in the list and the manifest; scaffolds nothing */
export async function generateAllPieces(project: Project, only?: string) {
  const { packageName } = await readProjectPackage(project);
  await syncPiecesRegistration({ project, packageName, only });
}

/* Runs each module type's generateAll{moduleType} function for the current project */
export async function generateAll(project: Project) {
  await generateAllDocumentModels(project);
  await generateAllEditors(project);
  await generateAllApps(project);
  await generateAllSubgraphs(project);
  await generateAllProcessors(project);
  await generateAllPieces(project);
  syncProjectAiToolsExport(project);
}
