import path from "node:path";
import {
  concat,
  filter,
  flatMap,
  isStrictEqual,
  map,
  pipe,
  when,
} from "remeda";
import type {
  NoSubstitutionTemplateLiteral,
  SourceFile,
  StringLiteral,
} from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import type { ClassName, FilePath } from "./types.js";

/**
 * Returns all string literal nodes in a source file.
 * */
export const getStringLiterals = (f: SourceFile) =>
  concat(
    f.getDescendantsOfKind(SyntaxKind.StringLiteral),
    f.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral),
  );

/**
 * Returns the raw text value of a string literal node.
 */
export const getStringLiteralText = (
  s: StringLiteral | NoSubstitutionTemplateLiteral,
) => s.getLiteralValue();
/**
 * Updates a string literal only when the new value differs from its current value.
 */
export const maybeUpdateStringLiteral =
  (s: StringLiteral | NoSubstitutionTemplateLiteral) => (c: ClassName) =>
    when(
      s,
      (s) => !isStrictEqual(c, getStringLiteralText(s)),
      (s) => s.setLiteralValue(c),
    );

/**
 * Adds a file path to the ts-morph project and returns the resulting source file.
 */
export const addFileToProcess = (p: Project) => (fp: FilePath) =>
  p.addSourceFileAtPath(fp);

/**
 * Minimal ts-morph project used for targeted AST edits.
 *
 * Files are added manually from `darkModeCandidateFiles`, so the project avoids
 * loading the full tsconfig file graph for performance.
 */
export const makeTsMorphProject = () =>
  new Project({
    tsConfigFilePath: path.join(process.argv[2] ?? ".", "tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
  });

export const getStringLiteralsFromFiles =
  (project: Project) => (files: FilePath[]) =>
    pipe(files, map(addFileToProcess(project)), flatMap(getStringLiterals));

export const getNodesWithText =
  (project: Project, text: string) => (files: FilePath[]) =>
    pipe(
      files,
      map(addFileToProcess(project)),
      flatMap((f) => f.getDescendants()),
      filter((n) => n.getDescendants().length === 0),
      filter((n) => n.getText().includes(text)),
    );
