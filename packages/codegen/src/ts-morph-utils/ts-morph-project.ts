import path from "path";
import { IndentationText, Project } from "ts-morph";

/** Returns the minimal typescript config for use in ts-morph file generation */
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

/** Instantiates a ts-morph Project using the default typescript config and nearest tsconfig.json file */
export function buildTsMorphProject(projectDir: string) {
  const tsConfigFilePath = path.join(projectDir, "tsconfig.json");
  const project = new Project(getDefaultProjectOptions(tsConfigFilePath));
  return project;
}

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
