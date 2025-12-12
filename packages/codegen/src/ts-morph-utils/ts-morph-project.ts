import path from "path";
import type { SourceFile } from "ts-morph";
import { IndentationText, Project, ts } from "ts-morph";

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

export function buildTsMorphProject(projectDir: string) {
  const tsConfigFilePath = path.join(projectDir, "tsconfig.json");
  const project = new Project(getDefaultProjectOptions(tsConfigFilePath));
  return project;
}

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

export function buildNodePrinter(sourceFile: SourceFile) {
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  return (node: ts.Node) =>
    printer.printNode(ts.EmitHint.Unspecified, node, sourceFile.compilerNode);
}
