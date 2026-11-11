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
} from "file-builders";
import { derivePieceId } from "name-builders";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readPackage } from "read-pkg";
import { filter, isIncludedIn, isTruthy, map, pipe } from "remeda";
import type { Project } from "ts-morph";
import {
  assertNoReservedOperationNames,
  getAppMetadata,
  getEditorDirNames,
  getEditorMetadata,
  getNonProcessorDirNames,
  getOrCreateDirectory,
  getProcessorDirNames,
  getProcessorMetadata,
  loadDocumentModelInDir,
  projectPath,
  readPiecesList,
} from "utils";
import { loadDocumentModel } from "./utils.js";

/**
 * Writes one stored model's generated files. It writes no barrel: the
 * package's `generateDocumentModel` finishes through the shared writer.
 */
export async function generateDocumentModel(
  documentModelState: DocumentModelGlobalState,
  project: Project,
) {
  assertNoReservedOperationNames(documentModelState);
  await tsMorphGenerateDocumentModel(documentModelState, project);
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
    defaultTimeoutSeconds?: number;
    defaultMaxAttempts?: number;
  },
  project: Project,
) {
  const { defaultTimeoutSeconds, defaultMaxAttempts } = args;
  if (
    defaultTimeoutSeconds !== undefined &&
    !(Number.isFinite(defaultTimeoutSeconds) && defaultTimeoutSeconds > 0)
  ) {
    throw new Error(
      `defaultTimeoutSeconds must be a positive number, got ${defaultTimeoutSeconds}`,
    );
  }
  if (
    defaultMaxAttempts !== undefined &&
    !(Number.isInteger(defaultMaxAttempts) && defaultMaxAttempts > 0)
  ) {
    throw new Error(
      `defaultMaxAttempts must be a positive integer, got ${defaultMaxAttempts}`,
    );
  }
  await tsMorphGeneratePieceAction({
    project,
    pieceDir: resolvePieceDir(project, args.pieceDir),
    actionName: args.actionName,
    requireReactor: args.requireReactor,
    defaultTimeoutSeconds,
    defaultMaxAttempts,
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
