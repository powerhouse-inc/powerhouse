import type { Project } from "ts-morph";

/** Gets a SourceFile by name in a ts-morph Project, or creates a new one
 * if none with that path exists.
 */
export function getOrCreateSourceFile(project: Project, filePath: string) {
  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    const newSourceFile = project.createSourceFile(filePath, "");
    return {
      alreadyExists: false,
      sourceFile: newSourceFile,
    };
  }
  return {
    alreadyExists: true,
    sourceFile,
  };
}

/** Ensures that the directories at the given paths exist within the
 * ts-morph Project
 */
export function ensureDirectoriesExist(
  project: Project,
  ...pathsToEnsure: string[]
) {
  for (const dirPath of pathsToEnsure) {
    const dir = project.getDirectory(dirPath);
    if (!dir) {
      project.createDirectory(dirPath);
      project.saveSync();
    }
  }
}

export function getPreviousVersionSourceFile(args: {
  project: Project;
  version: number;
  filePath: string;
}) {
  const { project, version, filePath } = args;
  const previousVersion = version - 1;
  if (previousVersion < 1) return;
  const previousVersionFilePath = filePath.replace(
    `/v${version}/`,
    `/v${previousVersion}/`,
  );

  const previousVersionFile = project.getSourceFile(previousVersionFilePath);

  return previousVersionFile;
}
