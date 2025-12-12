import path from "path";
import type { Project } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import {
  documentModelDocumentTypeMetadata,
  documentModelGlobalStateTypeName,
  documentTypePropertyName,
  phDocumentTypeName,
} from "./constants.js";
import { getObjectLiteral, getObjectProperty } from "./syntax-getters.js";
import type { DocumentModelDocumentTypeMetadata } from "./types.js";

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
    const variableStatement = sourceFile.getVariableStatement((statement) =>
      statement.getType().getText().includes(documentModelGlobalStateTypeName),
    );
    const documentModelGlobalState = getObjectLiteral(variableStatement);
    const documentType = getObjectProperty(
      documentModelGlobalState,
      documentTypePropertyName,
      SyntaxKind.StringLiteral,
    );
    const documentModelId = documentType?.getLiteralValue();
    if (!documentModelId) continue;
    const directory = sourceFile.getDirectory();
    const directorySourceFiles = directory.getSourceFiles();
    for (const file of directorySourceFiles) {
      const typeDeclaration = file.getTypeAlias(phDocumentTypeName);
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
      const documentModelImportPath = path.join(
        packageName,
        "document-models",
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
