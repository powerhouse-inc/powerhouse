import type { DocumentModelDocumentTypeMetadata } from "@powerhousedao/codegen/file-builders";
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
/** Gets the document model metadata for the --document-type argument
 * passed to the `generate --editor` and `generate --drive-editor` commands.
 */
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

  const documentModelDirName = documentModelDir.getBaseName();

  const documentModelImportPath = path.join(
    packageName,
    "document-models",
    documentModelDirName,
  );

  // types.ts lives in the same gen/ directory as document-model.ts
  // For non-versioned: <model>/gen/types.ts
  // For versioned: <model>/v1/gen/types.ts
  const sourceFileDir = sourceFile.getDirectoryPath();
  const documentModelGenTypesFilePath = path.join(sourceFileDir, "types.ts");

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
