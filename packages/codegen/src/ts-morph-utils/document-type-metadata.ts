import type { DocumentModelDocumentTypeMetadata } from "@powerhousedao/codegen/ts-morph";
import path from "path";
import type { Project, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { getObjectLiteral, getObjectProperty } from "./syntax-getters.js";

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
  const sourceFiles = project.getSourceFiles().filter((file) => {
    return file.getBaseName() === "document-model.ts";
  });

  const sourceFile = sourceFiles.find((file) =>
    getDocumentModelFileByDocumentId(file, documentModelId),
  );

  if (!sourceFile) {
    throw new Error(`No document-model.ts file exists for ${documentModelId}`);
  }

  const documentModelsDir = project.getDirectory(documentModelsDirPath);

  if (!documentModelsDir) {
    throw new Error(`No document-models dir exists for ${documentModelId}`);
  }

  const documentModelDir = project
    .getDirectories()
    .find(
      (dir) =>
        sourceFile.getDirectory().isDescendantOf(dir) &&
        dir.isDescendantOf(documentModelsDir),
    );

  if (!documentModelDir) {
    throw new Error(`No document model dir exists for ${documentModelId}`);
  }

  const documentModelDirPath = documentModelDir.getPath();
  const documentModelDirName = documentModelDir.getBaseName();

  const documentModelImportPath = path.join(
    packageName,
    "document-models",
    documentModelDirName,
  );

  const documentModelGenTypesFilePath = path.join(
    documentModelDirPath,
    "gen",
    "types.ts",
  );

  const documentModelGenTypesFile = project.getSourceFile(
    documentModelGenTypesFilePath,
  );

  if (!documentModelGenTypesFile) {
    throw new Error(`No generated types file exists for ${documentModelId}`);
  }

  const documentModelDocumentTypeName = getPHDocumentTypeNameFromSourceFile(
    documentModelGenTypesFile,
  );

  if (!documentModelDocumentTypeName) {
    throw new Error(
      `Generated type file is missing PHDocument type declaration for ${documentModelId}`,
    );
  }
  const documentTypeMetadata: DocumentModelDocumentTypeMetadata = {
    documentModelDirName,
    documentModelDocumentTypeName,
    documentModelId,
    documentModelImportPath,
  };

  return documentTypeMetadata;
}

function getDocumentModelFileByDocumentId(
  sourceFile: SourceFile,
  documentModelId: string,
) {
  const documentModelStatement =
    sourceFile.getVariableStatement("documentModel");

  if (!documentModelStatement) {
    return false;
  }

  const documentModelObject = getObjectLiteral(documentModelStatement);

  if (!documentModelObject) {
    return false;
  }

  const documentModelIdProperty = getObjectProperty(
    documentModelObject,
    "id",
    SyntaxKind.StringLiteral,
  );

  return documentModelIdProperty?.getLiteralValue() === documentModelId;
}

export function getPHDocumentTypeNameFromSourceFile(sourceFile: SourceFile) {
  return sourceFile
    .getTypeAliases()
    .find((alias) => {
      const typeNodeText = alias.getTypeNode()?.getText();
      return typeNodeText?.includes("PHDocument");
    })
    ?.getName();
}
