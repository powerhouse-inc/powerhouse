import {
  camelCase,
  capitalCase,
  constantCase,
  kebabCase,
  pascalCase,
} from "change-case";
import { createOrUpdateManifest, pruneManifestSection } from "file-builders";
import { derivePieceId } from "name-builders";
import path from "path";
import {
  pieceActionFileTemplate,
  pieceAuthFileTemplate,
  pieceAuthValueFileTemplate,
  pieceClientFileTemplate,
  pieceContextFileTemplate,
  pieceErrorsFileTemplate,
  pieceIndexFileTemplate,
  pieceLogoFileTemplate,
  pieceTriggerFileTemplate,
  piecesListFileTemplate,
} from "templates";
import { SyntaxKind, type Project, type SourceFile } from "ts-morph";
import {
  ensureDirectoriesExist,
  formatSourceFileWithPrettier,
  getOrCreateDirectory,
  getOrCreateSourceFile,
  getPieceMetadata,
  PIECES_DIR,
  pieceDirNameOf,
  pieceEntryPath,
  readPiecesList,
} from "utils";
import type {
  PieceAuthKind,
  PieceNames,
  PieceTriggerStrategy,
} from "./types.js";

const EXAMPLE_ACTION = "get-record";
const EXAMPLE_TRIGGER = "new-record";

export function getPieceNames(pieceName: string): PieceNames {
  return {
    kebabCaseName: kebabCase(pieceName),
    camelCaseName: camelCase(pieceName),
    pascalCaseName: pascalCase(pieceName),
    constantCaseName: constantCase(pieceName),
    displayName: capitalCase(pieceName),
  };
}

function actionExportName(names: PieceNames, actionName: string): string {
  return `${names.camelCaseName}${pascalCase(actionName)}Action`;
}

function triggerExportName(names: PieceNames, triggerName: string): string {
  return `${names.camelCaseName}${pascalCase(triggerName)}Trigger`;
}

async function writeUnlessExists(
  project: Project,
  filePath: string,
  contents: string,
) {
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );
  if (alreadyExists) return false;
  sourceFile.replaceWithText(contents);
  await formatSourceFileWithPrettier(sourceFile);
  return true;
}

function getPiecesArray(sourceFile: SourceFile) {
  return sourceFile
    .getVariableDeclaration("pieces")
    ?.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression)
    .at(0);
}

// Appended to with ts-morph rather than rewritten: every other element, its
// comments and a hand-tuned version stay exactly as they were written.
async function addPieceToList(v: {
  project: Project;
  piecesDirPath: string;
  pieceId: string;
  pieceVersion: string;
  kebabCaseName: string;
}) {
  const filePath = path.join(v.piecesDirPath, "index.ts");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    v.project,
    filePath,
  );
  if (!alreadyExists) sourceFile.replaceWithText(piecesListFileTemplate());

  const entry = pieceEntryPath(v.kebabCaseName);
  const list = getPiecesArray(sourceFile);
  if (!list) {
    // A list we cannot find the array in is the user's: say what to paste
    // rather than guess, which is how a hand-tuned version gets clobbered.
    throw new Error(
      `pieces/index.ts has no "pieces" array to add to. Add this entry by hand:\n` +
        `  { name: "${v.pieceId}", version: "${v.pieceVersion}", entry: "${entry}" }`,
    );
  }

  const already = list
    .getElements()
    .some(
      (element) =>
        element.getText().includes(`"${v.pieceId}"`) ||
        element.getText().includes(entry),
    );
  if (already) return;

  list.addElement(
    `{\n  name: "${v.pieceId}",\n  version: "${v.pieceVersion}",\n  entry: "${entry}",\n}`,
  );
  await formatSourceFileWithPrettier(sourceFile);
}

function getCreatePieceArray(sourceFile: SourceFile, name: string) {
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => call.getExpression().getText() === "createPiece")
    ?.getArguments()
    .at(0)
    ?.asKind(SyntaxKind.ObjectLiteralExpression)
    ?.getProperty(name)
    ?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
}

// The other half of generating an action or a trigger: the piece has to name
// it, or the block type it declares exists in no catalog.
async function addPartToPiece(v: {
  project: Project;
  pieceDirPath: string;
  arrayName: "actions" | "triggers";
  exportName: string;
  moduleSpecifier: string;
}) {
  const filePath = path.join(v.pieceDirPath, "index.ts");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    v.project,
    filePath,
  );
  if (!alreadyExists) {
    throw new Error(
      `${path.relative(path.dirname(v.pieceDirPath), filePath)} does not exist. Run \`ph generate piece\` first.`,
    );
  }
  const array = getCreatePieceArray(sourceFile, v.arrayName);
  if (!array) {
    throw new Error(
      `${filePath} has no createPiece "${v.arrayName}" array to add to. Add "${v.exportName}" to it by hand.`,
    );
  }
  if (!array.getElements().some((e) => e.getText() === v.exportName)) {
    array.addElement(v.exportName);
  }
  const imported = sourceFile
    .getImportDeclarations()
    .flatMap((declaration) => declaration.getNamedImports())
    .some((named) => named.getName() === v.exportName);
  if (!imported) {
    sourceFile.addImportDeclaration({
      namedImports: [v.exportName],
      moduleSpecifier: v.moduleSpecifier,
    });
  }
  await formatSourceFileWithPrettier(sourceFile);
}

function pieceDirPaths(project: Project, kebabCaseName: string) {
  const { directory: piecesDir } = getOrCreateDirectory(project, PIECES_DIR);
  const piecesDirPath = piecesDir.getPath();
  const pieceDirPath = path.join(piecesDirPath, kebabCaseName);
  return {
    projectDir: piecesDir.getParentOrThrow().getPath(),
    piecesDirPath,
    pieceDirPath,
    libDirPath: path.join(pieceDirPath, "lib"),
    commonDirPath: path.join(pieceDirPath, "lib", "common"),
    actionsDirPath: path.join(pieceDirPath, "lib", "actions"),
    triggersDirPath: path.join(pieceDirPath, "lib", "triggers"),
  };
}

export async function tsMorphGeneratePiece(args: {
  project: Project;
  /** Human name; the directory is its kebab case. */
  pieceName: string;
  /** The piece id a block type names. */
  pieceId: string;
  /** The version the list entry declares. */
  pieceVersion: string;
  auth: PieceAuthKind;
  description: string;
}): Promise<void> {
  const { project, pieceName, pieceId, pieceVersion, auth, description } = args;
  const names = getPieceNames(pieceName);
  const withAuth = auth !== "none";
  const paths = pieceDirPaths(project, names.kebabCaseName);

  const conflict = readPiecesList(project).find(
    (entry) =>
      entry.name === pieceId &&
      pieceDirNameOf(entry) !== undefined &&
      pieceDirNameOf(entry) !== names.kebabCaseName,
  );
  if (conflict) {
    throw new Error(
      `pieces/index.ts already lists "${pieceId}" at ${conflict.entry ?? conflict.bundle}. Pass a different --id.`,
    );
  }

  await ensureDirectoriesExist(
    project,
    paths.piecesDirPath,
    paths.pieceDirPath,
    paths.libDirPath,
    paths.actionsDirPath,
    paths.triggersDirPath,
    ...(withAuth ? [paths.commonDirPath] : []),
  );

  await writeUnlessExists(
    project,
    path.join(paths.libDirPath, "logo.ts"),
    pieceLogoFileTemplate(names),
  );
  if (withAuth) {
    const authKind = auth === "secret" ? "secret" : "custom";
    await writeUnlessExists(
      project,
      path.join(paths.commonDirPath, "errors.ts"),
      pieceErrorsFileTemplate(names),
    );
    await writeUnlessExists(
      project,
      path.join(paths.commonDirPath, "auth-value.ts"),
      pieceAuthValueFileTemplate({ ...names, auth: authKind }),
    );
    await writeUnlessExists(
      project,
      path.join(paths.commonDirPath, "client.ts"),
      pieceClientFileTemplate(names),
    );
    await writeUnlessExists(
      project,
      path.join(paths.commonDirPath, "context.ts"),
      pieceContextFileTemplate(names),
    );
    await writeUnlessExists(
      project,
      path.join(paths.libDirPath, "auth.ts"),
      pieceAuthFileTemplate({ ...names, auth: authKind }),
    );
  }

  await writeUnlessExists(
    project,
    path.join(paths.actionsDirPath, `${EXAMPLE_ACTION}.ts`),
    pieceActionFileTemplate({
      ...names,
      exportName: actionExportName(names, EXAMPLE_ACTION),
      actionName: EXAMPLE_ACTION,
      actionDisplayName: capitalCase(EXAMPLE_ACTION),
      withAuth,
    }),
  );
  await writeUnlessExists(
    project,
    path.join(paths.triggersDirPath, `${EXAMPLE_TRIGGER}.ts`),
    pieceTriggerFileTemplate({
      ...names,
      exportName: triggerExportName(names, EXAMPLE_TRIGGER),
      triggerName: EXAMPLE_TRIGGER,
      triggerDisplayName: capitalCase(EXAMPLE_TRIGGER),
      strategy: "polling",
      withAuth,
    }),
  );

  await writeUnlessExists(
    project,
    path.join(paths.pieceDirPath, "index.ts"),
    pieceIndexFileTemplate({
      ...names,
      description,
      withAuth,
      actionExportName: actionExportName(names, EXAMPLE_ACTION),
      actionFileName: EXAMPLE_ACTION,
      triggerExportName: triggerExportName(names, EXAMPLE_TRIGGER),
      triggerFileName: EXAMPLE_TRIGGER,
    }),
  );

  await addPieceToList({
    project,
    piecesDirPath: paths.piecesDirPath,
    pieceId,
    pieceVersion,
    kebabCaseName: names.kebabCaseName,
  });

  // Id and display name only: version, description, bundle and descriptor are
  // what `ph build` writes, and only into the manifest copy under dist.
  await createOrUpdateManifest(
    { pieces: [{ id: pieceId, name: names.displayName }] },
    paths.projectDir,
  );
}

function namesForExistingPiece(project: Project, dirName: string) {
  const metadata = getPieceMetadata(project, dirName);
  const names = getPieceNames(dirName);
  return {
    names: {
      ...names,
      displayName: metadata.displayName ?? names.displayName,
    },
    withAuth: metadata.hasAuth,
  };
}

export async function tsMorphGeneratePieceAction(args: {
  project: Project;
  /** Directory under pieces/. */
  pieceDir: string;
  actionName: string;
}): Promise<void> {
  const { project, pieceDir, actionName } = args;
  const kebabActionName = kebabCase(actionName);
  const paths = pieceDirPaths(project, pieceDir);
  const { names, withAuth } = namesForExistingPiece(project, pieceDir);
  await ensureDirectoriesExist(project, paths.actionsDirPath);

  const exportName = actionExportName(names, kebabActionName);
  await writeUnlessExists(
    project,
    path.join(paths.actionsDirPath, `${kebabActionName}.ts`),
    pieceActionFileTemplate({
      ...names,
      exportName,
      actionName: kebabActionName,
      actionDisplayName: capitalCase(actionName),
      withAuth,
    }),
  );
  await addPartToPiece({
    project,
    pieceDirPath: paths.pieceDirPath,
    arrayName: "actions",
    exportName,
    moduleSpecifier: `./lib/actions/${kebabActionName}.js`,
  });
}

export async function tsMorphGeneratePieceTrigger(args: {
  project: Project;
  pieceDir: string;
  triggerName: string;
  strategy: PieceTriggerStrategy;
}): Promise<void> {
  const { project, pieceDir, triggerName, strategy } = args;
  const kebabTriggerName = kebabCase(triggerName);
  const paths = pieceDirPaths(project, pieceDir);
  const { names, withAuth } = namesForExistingPiece(project, pieceDir);
  await ensureDirectoriesExist(project, paths.triggersDirPath);

  const exportName = triggerExportName(names, kebabTriggerName);
  await writeUnlessExists(
    project,
    path.join(paths.triggersDirPath, `${kebabTriggerName}.ts`),
    pieceTriggerFileTemplate({
      ...names,
      exportName,
      triggerName: kebabTriggerName,
      triggerDisplayName: capitalCase(triggerName),
      strategy,
      withAuth,
    }),
  );
  await addPartToPiece({
    project,
    pieceDirPath: paths.pieceDirPath,
    arrayName: "triggers",
    exportName,
    moduleSpecifier: `./lib/triggers/${kebabTriggerName}.js`,
  });
}

/** Refresh the list and the manifest from the directories on disk. */
export async function syncPiecesRegistration(args: {
  project: Project;
  packageName: string;
  packageVersion: string;
  /** Limit which directories may gain a list entry; the manifest still syncs whole. */
  only?: string;
}): Promise<{ ids: string[] }> {
  const { project, packageName, packageVersion, only } = args;
  const { directory: piecesDir } = getOrCreateDirectory(project, PIECES_DIR);
  const piecesDirPath = piecesDir.getPath();
  const projectDir = piecesDir.getParentOrThrow().getPath();
  project.addSourceFilesAtPaths(path.join(piecesDirPath, "*", "index.ts"));

  const dirNames = piecesDir
    .getDirectories()
    .filter((directory) => directory.getSourceFile("index.ts") !== undefined)
    .map((directory) => directory.getBaseName());

  const listed = new Map(
    readPiecesList(project).map((entry) => [pieceDirNameOf(entry), entry]),
  );
  for (const dirName of dirNames) {
    if (listed.has(dirName)) continue;
    if (only !== undefined && only !== dirName) continue;
    const { id } = derivePieceId({
      packageName,
      slug: dirName,
      hasOtherPieces: listed.size > 0,
    });
    await addPieceToList({
      project,
      piecesDirPath,
      pieceId: id,
      pieceVersion: id === packageName ? packageVersion : "1.0.0",
      kebabCaseName: dirName,
    });
  }

  // Re-read: the entries just added are the ones the manifest needs too.
  const entries = readPiecesList(project);
  const pieces = entries
    .map((entry) => ({ entry, dirName: pieceDirNameOf(entry) }))
    .filter(
      ({ dirName }) => dirName === undefined || dirNames.includes(dirName),
    )
    .map(({ entry, dirName }) => ({
      id: entry.name,
      name:
        (dirName === undefined
          ? undefined
          : getPieceMetadata(project, dirName).displayName) ?? entry.name,
    }));

  if (pieces.length > 0) {
    await createOrUpdateManifest({ pieces }, projectDir);
  }
  // A list entry whose directory is gone stays listed — `ph build` names it,
  // which is better than deleting what someone meant to keep.
  await pruneManifestSection(
    projectDir,
    "pieces",
    pieces.map((piece) => piece.id),
  );
  return { ids: pieces.map((piece) => piece.id) };
}
