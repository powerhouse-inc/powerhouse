import path from "path";

export function buildEditorsDirPath(projectDir: string) {
  return path.join(projectDir, "editors");
}

export function buildEditorDirPath(projectDir: string, editorDir: string) {
  const editorsDirPath = buildEditorsDirPath(projectDir);
  return path.join(editorsDirPath, editorDir);
}

export function buildEditorComponentsDirPath(
  projectDir: string,
  editorDir: string,
) {
  const editorDirPath = buildEditorDirPath(projectDir, editorDir);
  return path.join(editorDirPath, "components");
}

export function buildEditorFilePath(projectDir: string, editorDir: string) {
  const editorDirPath = buildEditorDirPath(projectDir, editorDir);
  return path.join(editorDirPath, "editor.tsx");
}

export function buildEditDocumentNameComponentFilePath(
  projectDir: string,
  editorDir: string,
) {
  const editorComponentsDirPath = buildEditorComponentsDirPath(
    projectDir,
    editorDir,
  );
  return path.join(editorComponentsDirPath, "EditName.tsx");
}

export function buildEditorConfigFilePath(
  projectDir: string,
  editorDir: string,
) {
  const editorDirPath = buildEditorDirPath(projectDir, editorDir);
  return path.join(editorDirPath, "config.ts");
}

export function buildDriveContentsFilePath(
  projectDir: string,
  editorDir: string,
) {
  const editorComponentsDirPath = buildEditorComponentsDirPath(
    projectDir,
    editorDir,
  );
  return path.join(editorComponentsDirPath, "DriveContents.tsx");
}

export function buildEditorModuleFilePath(
  projectDir: string,
  editorDir: string,
) {
  const editorDirPath = buildEditorDirPath(projectDir, editorDir);
  return path.join(editorDirPath, "module.ts");
}

export function buildEditorSourceFilesPath(projectDir: string) {
  const editorsDirPath = buildEditorsDirPath(projectDir);
  return path.join(editorsDirPath, "/**/*");
}
