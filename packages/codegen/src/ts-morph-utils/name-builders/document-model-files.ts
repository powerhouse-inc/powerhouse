import path from "path";

export function buildDocumentModelsDirPath(projectDir: string) {
  return path.join(projectDir, "document-models");
}

export function buildDocumentModelsSourceFilesPath(projectDir: string) {
  const documentModelsDirPath = buildDocumentModelsDirPath(projectDir);
  return path.join(documentModelsDirPath, "/**/*");
}

export function buildDocumentModelImportPath(
  packageName: string,
  documentModelDirName: string,
) {
  return path.join(packageName, "document-models", documentModelDirName);
}
