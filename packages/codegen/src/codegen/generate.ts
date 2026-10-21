import { type DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import type { ProcessorApps } from "@powerhousedao/shared/processors";
import { kebabCase } from "change-case";
import type {
  CodeFirstInventory,
  GenerateCodeFirstDocumentModelArgs,
  PieceAuthKind,
  PieceRequireReactor,
  PieceTriggerStrategy,
} from "file-builders";
import {
  createOrUpdateManifest,
  getPieceNames,
  loadCodeFirstInventory,
  loadSubgraphInventory,
  makeSubgraphsIndexFile,
  planSubgraphsIndexFile,
  pruneManifestSection,
  readManifest,
  syncPiecesRegistration,
  syncProjectAiToolsExport,
  tsMorphGenerateApp,
  tsMorphGenerateCodeFirstDocumentModel,
  tsMorphGenerateDocumentEditor,
  tsMorphGenerateDocumentModel,
  tsMorphGeneratePiece,
  tsMorphGeneratePieceAction,
  tsMorphGeneratePieceTrigger,
  tsMorphGenerateProcessor,
  tsMorphGenerateSubgraph,
  warnUnregisteredCodeFirstDefinitions,
} from "file-builders";
import { derivePieceId } from "name-builders";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readPackage } from "read-pkg";
import { filter, isIncludedIn, isTruthy, map, pipe, prop } from "remeda";
import type { Project } from "ts-morph";
import {
  discoverDocumentModelInDir,
  getAppMetadata,
  getEditorMetadata,
  getOrCreateDirectory,
  getProcessorMetadata,
  projectDirOf,
  readPiecesList,
} from "utils";
import { loadDocumentModel } from "./utils.js";

export async function generateDocumentModel(
  documentModelState: DocumentModelGlobalState,
  project: Project,
) {
  await tsMorphGenerateDocumentModel(documentModelState, project);
  warnUnregisteredCodeFirstDefinitions(projectDirOf(project));
}

export async function generateCodeFirstDocumentModel(
  args: GenerateCodeFirstDocumentModelArgs,
  project: Project,
) {
  return await tsMorphGenerateCodeFirstDocumentModel(args, project);
}

/* Runs generate for each document model json file found in the project's `document-models` directory  */
export async function generateAllDocumentModels(
  project: Project,
  codeFirstInventory?: CodeFirstInventory,
) {
  const projectDir = projectDirOf(project);
  const { directory: documentModelsDir } = getOrCreateDirectory(
    project,
    join(projectDir, "document-models"),
  );
  const documentModelsDirPath = documentModelsDir.getPath();
  warnUnregisteredCodeFirstDefinitions(projectDir);
  const codeFirst =
    codeFirstInventory ?? (await loadCodeFirstInventory(projectDir));
  const discoveries = pipe(
    readdirSync(documentModelsDirPath, { withFileTypes: true }),
    map((dirent) => ({
      dirName: dirent.name,
      discovery: discoverDocumentModelInDir(dirent),
    })),
  );
  const invalid = discoveries.flatMap(({ dirName, discovery }) =>
    discovery.kind === "invalid" ? [{ dirName, error: discovery.error }] : [],
  );
  for (const { error } of invalid) console.error(error);
  const documentModelStateFiles = discoveries.flatMap(({ discovery }) =>
    discovery.kind === "model" ? [discovery.state] : [],
  );

  for (const documentModelState of documentModelStateFiles) {
    await tsMorphGenerateDocumentModel(documentModelState, project);
  }

  const files = invalid.map(({ dirName }) => `${dirName}/${dirName}.json`);
  await syncManifestSection(
    projectDir,
    "documentModels",
    files.length > 0
      ? {
          kind: "incomplete",
          warning: `${files.length} document model file(s) could not be read (${files.join(", ")}).`,
        }
      : { kind: "complete", ids: documentModelStateFiles.map((s) => s.id) },
    codeFirst,
  );
}

type SchemaFirstInventory =
  | { kind: "complete"; ids: string[] }
  | { kind: "incomplete"; warning: string };

async function syncManifestSection(
  projectDir: string,
  section: "documentModels",
  schemaFirst: SchemaFirstInventory,
  codeFirst: CodeFirstInventory,
) {
  const kept = `Kept every ${section} entry in powerhouse.manifest.json:`;
  if (codeFirst.kind === "unavailable") {
    console.warn(
      `${kept} definitionSources in powerhouse.config.json could not be read or loaded.\n${codeFirst.reason}`,
    );
    return;
  }
  const codeFirstModules =
    codeFirst.kind === "loaded" ? codeFirst[section] : [];
  if (schemaFirst.kind === "incomplete") {
    console.warn(`${kept} ${schemaFirst.warning}`);
  } else {
    await pruneManifestSection(projectDir, section, [
      ...schemaFirst.ids,
      ...codeFirstModules.map(prop("id")),
    ]);
  }
  if (codeFirstModules.length === 0) return;
  const listed = new Set(
    (await readManifest(projectDir))?.manifest[section]?.map(prop("id")),
  );
  if (codeFirstModules.some(({ id }) => !listed.has(id))) {
    await createOrUpdateManifest({ [section]: codeFirstModules }, projectDir);
  }
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
  const projectDir = projectDirOf(project);
  const { directory: editorsDir } = getOrCreateDirectory(
    project,
    join(projectDir, "editors"),
  );
  // The project starts without files, so load the ones discovery reads.
  project.addSourceFilesAtPaths(join(editorsDir.getPath(), "*", "module.ts"));

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
  const projectDir = projectDirOf(project);
  const { directory: editorsDir } = getOrCreateDirectory(
    project,
    join(projectDir, "editors"),
  );

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
export type SubgraphGenerationOptions = {
  /** Runs after files are saved, before imports, to allow dependency installation. */
  readonly beforeCheck?: () => Promise<void>;
};

/** Existing subgraph directories are preserved. Manifest updates require a passing check. */
export async function generateSubgraph(
  subgraphName: string,
  project: Project,
  options: SubgraphGenerationOptions = {},
) {
  const { directory } = getOrCreateDirectory(
    project,
    join(projectDirOf(project), "subgraphs"),
  );
  const subgraphsDir = directory.getPath();
  const id = kebabCase(subgraphName);
  const scaffold = !existsSync(join(subgraphsDir, id));
  if (scaffold) {
    if (existsSync(join(subgraphsDir, "index.ts")))
      await assertSubgraphsIndexRegenerable(project, subgraphsDir);
    await tsMorphGenerateSubgraph({ subgraphName, project });
  }
  await refreshSubgraphs(project, {
    ...options,
    prune: false,
    scaffolded: scaffold ? { name: subgraphName, id } : undefined,
  });
}

async function assertSubgraphsIndexRegenerable(
  project: Project,
  subgraphsDir: string,
): Promise<void> {
  await planSubgraphsIndexFile({ project, subgraphsDir });
}

/** Thrown when a subgraph in the package is old-style, nameless, or broken. */
export class SubgraphCheckError extends Error {
  constructor(errors: readonly string[]) {
    super(
      `Kept every subgraphs entry in powerhouse.manifest.json: ${errors.length} subgraph error(s).\n${errors.join("\n")}`,
    );
    this.name = "SubgraphCheckError";
  }
}

/** Repairs the barrel and checks subgraphs before updating the manifest; preserves authored files. */
export async function generateAllSubgraphs(
  project: Project,
  options: SubgraphGenerationOptions = {},
) {
  await refreshSubgraphs(project, { ...options, prune: true });
}

async function refreshSubgraphs(
  project: Project,
  {
    prune,
    scaffolded,
    beforeCheck,
  }: SubgraphGenerationOptions & {
    readonly prune: boolean;
    readonly scaffolded?: { readonly name: string; readonly id: string };
  },
) {
  const projectDir = projectDirOf(project);
  const { directory } = getOrCreateDirectory(
    project,
    join(projectDir, "subgraphs"),
  );
  const subgraphsDir = directory.getPath();
  if (!existsSync(subgraphsDir)) return;
  await makeSubgraphsIndexFile({ project, subgraphsDir });
  await beforeCheck?.();

  const inventory = await loadSubgraphInventory(projectDir);
  if (inventory.kind === "invalid")
    throw new SubgraphCheckError(inventory.errors);
  for (const warning of inventory.warnings) console.warn(`⚠ ${warning}`);
  if (scaffolded) {
    await createOrUpdateManifest({ subgraphs: [scaffolded] }, projectDir);
  }
  if (prune) {
    await pruneManifestSection(
      projectDir,
      "subgraphs",
      inventory.subgraphs.map(prop("id")),
    );
  }
  const listed = new Set(
    (await readManifest(projectDir))?.manifest.subgraphs?.map(prop("id")),
  );
  const missing = inventory.subgraphs.filter(({ id }) => !listed.has(id));
  if (missing.length > 0) {
    await createOrUpdateManifest({ subgraphs: missing }, projectDir);
  }
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
  const projectDir = projectDirOf(project);
  const { directory: processorsDir } = getOrCreateDirectory(
    project,
    join(projectDir, "processors"),
  );
  // connect.ts and switchboard.ts decide each processor's apps.
  project.addSourceFilesAtPaths([
    join(processorsDir.getPath(), "*.ts"),
    join(processorsDir.getPath(), "*", "*.ts"),
  ]);
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

// Tolerant of a project with no package.json: `generateAll` runs over whatever
// is on disk, and only a piece id derived from the package name needs it.
async function readProjectPackage(project: Project) {
  const projectDir = projectDirOf(project);
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
  const { directory: piecesDir } = getOrCreateDirectory(
    project,
    join(projectDirOf(project), "pieces"),
  );
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
  const codeFirst = await loadCodeFirstInventory(projectDirOf(project));
  await generateAllDocumentModels(project, codeFirst);
  await generateAllEditors(project);
  await generateAllApps(project);
  const deferredSubgraphFailure = await generateAllSubgraphs(project).then(
    () => undefined,
    (error: Error) => error,
  );
  await generateAllProcessors(project);
  await generateAllPieces(project);
  syncProjectAiToolsExport(project);
  if (deferredSubgraphFailure !== undefined) throw deferredSubgraphFailure;
}
