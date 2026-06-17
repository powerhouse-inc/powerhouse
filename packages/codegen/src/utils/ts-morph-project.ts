import path from "path";
import { IndentationText, Project } from "ts-morph";

export const DEFAULT_PROJECT_OPTIONS = {
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
} as const;

/** Returns the minimal typescript config for use in ts-morph file generation */
export function getDefaultProjectOptions(tsConfigFilePath: string) {
  return {
    ...DEFAULT_PROJECT_OPTIONS,
    tsConfigFilePath,
  };
}

/** Instantiates a ts-morph Project using the default typescript config and nearest tsconfig.json file */
export function buildTsMorphProject(projectDir: string) {
  /* In general ts-morph struggles when its instance is running in a different directory to the tsconfig.json file it's using */
  process.chdir(projectDir);
  const tsConfigFilePath = path.join(projectDir, "tsconfig.json");
  const project = new Project({
    ...DEFAULT_PROJECT_OPTIONS,
    tsConfigFilePath,
    /* This avoids adding many files that are referenced by a given tsconfig in a monorepo
     * Probably only relevant for internal testing in this monorepo */
    skipFileDependencyResolution: true,
  });
  return project;
}
