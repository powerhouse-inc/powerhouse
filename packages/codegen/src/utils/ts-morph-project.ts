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
