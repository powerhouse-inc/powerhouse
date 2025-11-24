import type { Project, SourceFile } from "ts-morph";
import { IndentationText, SyntaxKind, ts } from "ts-morph";
import {
  documentModelDocumentTypeMetadata,
  documentModelGlobalStateTypeName,
  documentTypePropertyName,
  phDocumentTypeName,
} from "./constants.js";
import { buildDocumentModelImportPath } from "./name-builders/document-model-files.js";
import {
  getObjectLiteral,
  getObjectProperty,
  getStringLiteralValue,
  getTypeDeclarationByTypeName,
  getVariableDeclarationByTypeName,
} from "./syntax-getters.js";
import type { DocumentModelDocumentTypeMetadata } from "./types.js";

export function getOrCreateSourceFile(project: Project, filePath: string) {
  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    return project.createSourceFile(filePath, "");
  }
  console.log(`Source file ${filePath} already exists`);
  console.log(sourceFile.getFullText());
  return sourceFile;
}

export function getDefaultProjectOptions(tsConfigFilePath: string) {
  const DEFAULT_PROJECT_OPTIONS = {
    // don't add files from the tsconfig.json file, only use the ones we need
    skipAddingFilesFromTsConfig: true,
    // don't load library files, we only need the files we're adding
    skipLoadingLibFiles: true,
    // use formatting rules which match prettier
    manipulationSettings: {
      useTrailingCommas: true,
      indentationText: IndentationText.TwoSpaces,
      indentMultiLineObjectLiteralBeginningOnBlankLine: true,
    },
  };
  return {
    ...DEFAULT_PROJECT_OPTIONS,
    tsConfigFilePath,
  };
}

export function buildNodePrinter(sourceFile: SourceFile) {
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  return (node: ts.Node) =>
    printer.printNode(ts.EmitHint.Unspecified, node, sourceFile.compilerNode);
}
type GetDocumentTypeMetadataArgs = {
  project: Project;
  packageName: string;
  documentModelId: string;
  documentModelsDirPath: string;
};
export function getDocumentTypeMetadata({
  project,
  packageName,
  documentModelId,
  documentModelsDirPath,
}: GetDocumentTypeMetadataArgs) {
  const sourceFiles = project.getSourceFiles();
  const documentTypeMetadataList: DocumentModelDocumentTypeMetadata[] = [
    documentModelDocumentTypeMetadata,
  ];
  for (const sourceFile of sourceFiles) {
    const variableDeclaration = getVariableDeclarationByTypeName(
      sourceFile,
      documentModelGlobalStateTypeName,
    );
    const variableStatement = variableDeclaration?.getVariableStatement();
    const documentModelGlobalState = getObjectLiteral(variableStatement);
    const documentType = getObjectProperty(
      documentModelGlobalState,
      documentTypePropertyName,
      SyntaxKind.StringLiteral,
    );
    const documentModelId = getStringLiteralValue(documentType);
    if (!documentModelId) continue;
    const directory = sourceFile.getDirectory();
    const directorySourceFiles = directory.getSourceFiles();
    for (const file of directorySourceFiles) {
      const typeDeclaration = getTypeDeclarationByTypeName(
        file,
        phDocumentTypeName,
      );
      const documentModelDocumentTypeName = typeDeclaration?.getName();
      if (!documentModelDocumentTypeName) continue;
      const documentModelsDir = project.getDirectory(documentModelsDirPath);
      if (!documentModelsDir) continue;
      const documentModelDir = project
        .getDirectories()
        .filter((dir) => dir.getPath().includes("document-models"))
        .find((dir) => {
          return (
            dir.isAncestorOf(sourceFile) && documentModelsDir.isAncestorOf(dir)
          );
        });
      if (!documentModelDir) continue;
      const documentModelDirName = documentModelDir.getBaseName();
      const documentModelImportPath = buildDocumentModelImportPath(
        packageName,
        documentModelDirName,
      );
      documentTypeMetadataList.push({
        documentModelId,
        documentModelDocumentTypeName,
        documentModelDirName,
        documentModelImportPath,
      });
    }
  }
  const documentTypeMetadata = documentTypeMetadataList.find(
    (metadata) => metadata.documentModelId === documentModelId,
  );
  if (!documentTypeMetadata) {
    throw new Error(
      `Document type metadata not found for document type: ${documentModelId}`,
    );
  }

  return documentTypeMetadata;
}
