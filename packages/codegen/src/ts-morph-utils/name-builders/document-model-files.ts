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

export function buildDocumentModelRootDirFilePath(
  documentModelDirPath: string,
  fileName: string,
) {
  return path.join(documentModelDirPath, fileName);
}

export function buildDocumentModelSrcDirFilePath(
  documentModelDirPath: string,
  fileName: string,
) {
  return path.join(documentModelDirPath, "src", fileName);
}

export function buildDocumentModelGenDirFilePath(
  documentModelDirPath: string,
  fileName: string,
) {
  return path.join(documentModelDirPath, "gen", fileName);
}
