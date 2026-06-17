import { pascalCase } from "change-case";
import path from "path";
import { filter, forEach, isTruthy, map, pipe, uniqueBy } from "remeda";
import { documentEditorModuleFileTemplate, editorsTemplate } from "templates";
import { SyntaxKind, type Project } from "ts-morph";
import {
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
  getVariableDeclarationByTypeName,
} from "utils";

type MakeEditorModuleFileArgs = {
  project: Project;
  editorName: string;
  editorId: string;
  documentModelId?: string;
  editorDirPath: string;
  legacyMultipleDocumentTypes?: string[];
};
/** Generates the `module.ts` file for a document editor or app */
export async function makeEditorModuleFile({
  project,
  editorDirPath,
  editorName,
  documentModelId,
  editorId,
  legacyMultipleDocumentTypes,
}: MakeEditorModuleFileArgs) {
  if (documentModelId && !!legacyMultipleDocumentTypes) {
    throw new Error(
      "Cannot specify both documentModelId and legacyMultipleDocumentTypes",
    );
  }
  const filePath = path.join(editorDirPath, "module.ts");
  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText("");

  const pascalCaseEditorName = pascalCase(editorName);
  const documentTypes = documentModelId
    ? [documentModelId]
    : (legacyMultipleDocumentTypes ?? []);

  const template = documentEditorModuleFileTemplate({
    editorName,
    editorId,
    pascalCaseEditorName,
    documentTypes,
  });
  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeEditorsFile(args: {
  project: Project;
  editorsDirPath: string;
}) {
  const { project, editorsDirPath } = args;
  // With skipAddingFilesFromTsConfig, pre-existing module.ts files aren't in
  // the project; add them so existing editors/apps are preserved on rebuild.
  project.addSourceFilesAtPaths(path.join(editorsDirPath, "**", "module.ts"));
  const sourceFile = project.createSourceFile(
    path.join(editorsDirPath, "editors.ts"),
    editorsTemplate,
    { overwrite: true },
  );

  const editorsArray = sourceFile
    .getVariableDeclarationOrThrow("editors")
    .getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression);

  pipe(
    project.getDirectoryOrThrow(editorsDirPath).getDescendantSourceFiles(),
    filter((sourceFile) => sourceFile.getBaseName() === "module.ts"),
    uniqueBy((sourceFile) => sourceFile.getFilePath()),
    map((sourceFile) =>
      getVariableDeclarationByTypeName(sourceFile, "EditorModule"),
    ),
    filter(isTruthy),
    map((variableDeclaration) => ({
      name: variableDeclaration.getName(),
      editorDir: variableDeclaration
        .getSourceFile()
        .getDirectory()
        .getBaseName(),
    })),
    map(({ name, editorDir }) => ({
      name,
      namedImports: [name],
      moduleSpecifier: `./${path.join(editorDir, "module.js")}`,
    })),
    forEach(({ name, namedImports, moduleSpecifier }) => {
      sourceFile.addImportDeclaration({
        namedImports,
        moduleSpecifier,
      });
      editorsArray.addElement(name);
    }),
  );

  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeEditorsIndexFile(args: {
  project: Project;
  editorsDirPath: string;
}) {
  const { project, editorsDirPath } = args;
  project.addSourceFilesAtPaths(path.join(editorsDirPath, "**", "module.ts"));
  const sourceFile = project.createSourceFile(
    path.join(editorsDirPath, "index.ts"),
    "",
    { overwrite: true },
  );

  pipe(
    project.getDirectoryOrThrow(editorsDirPath).getDescendantSourceFiles(),
    filter((sourceFile) => sourceFile.getBaseName() === "module.ts"),
    uniqueBy((sourceFile) => sourceFile.getFilePath()),
    map((sourceFile) =>
      getVariableDeclarationByTypeName(sourceFile, "EditorModule"),
    ),
    filter(isTruthy),
    map((variableDeclaration) => ({
      name: variableDeclaration.getName(),
      editorDir: variableDeclaration
        .getSourceFile()
        .getDirectory()
        .getBaseName(),
    })),
    map(({ name, editorDir }) => ({
      namedExports: [name],
      moduleSpecifier: `./${path.join(editorDir, "module.js")}`,
    })),
    forEach(({ namedExports, moduleSpecifier }) => {
      sourceFile.addExportDeclaration({
        namedExports,
        moduleSpecifier,
      });
    }),
  );

  await formatSourceFileWithPrettier(sourceFile);
}
