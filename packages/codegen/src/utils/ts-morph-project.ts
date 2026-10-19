import path from "path";
import { IndentationText, Project } from "ts-morph";

export const DEFAULT_PROJECT_OPTIONS = {
  // don't add files from the tsconfig.json file, only use the ones we need
  skipAddingFilesFromTsConfig: true,
  // don't load library files, we only need the files we're adding
  skipLoadingLibFiles: true,
  // formatting rules consistent with the project's formatter
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

/** Instantiates a ts-morph Project from `<projectDir>/tsconfig.json` with the default typescript config */
export function buildTsMorphProject(projectDir: string) {
  return new Project({
    ...DEFAULT_PROJECT_OPTIONS,
    tsConfigFilePath: path.resolve(projectDir, "tsconfig.json"),
    /* This avoids adding many files that are referenced by a given tsconfig in a monorepo
     * Probably only relevant for internal testing in this monorepo */
    skipFileDependencyResolution: true,
  });
}

/** The directory of the tsconfig.json the project was built from; codegen resolves project paths against it. */
export function projectDirOf(project: Project): string {
  const { configFilePath } = project.getCompilerOptions();
  if (typeof configFilePath !== "string") {
    throw new Error(
      "Codegen needs a ts-morph Project built from a tsconfig.json, as buildTsMorphProject does.",
    );
  }
  return path.dirname(configFilePath);
}
