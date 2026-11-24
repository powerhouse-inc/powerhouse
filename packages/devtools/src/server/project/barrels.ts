import { posix } from "node:path";
import { ts } from "ts-morph";
import { readText } from "./project-fs.js";

/** A file that registers modules by importing or re-exporting them. */
export type Barrel = {
  /** POSIX, relative to the project. */
  path: string;
  /** Whether an import or re-export of the barrel names a module below `folder`. */
  references: (folder: string) => boolean;
};

/**
 * Reads the modules a barrel names, without resolving or running anything. A
 * relative specifier is taken from the barrel's directory. Any other one is
 * taken from the project root, which is how generated projects alias
 * `document-models/…` and `processors/…`.
 */
export function readBarrel(root: string, path: string): Barrel {
  const text = readText(root, path);
  const targets =
    text === undefined
      ? []
      : ts
          .createSourceFile(path, text, ts.ScriptTarget.Latest)
          .statements.flatMap((statement) =>
            (ts.isImportDeclaration(statement) ||
              ts.isExportDeclaration(statement)) &&
            statement.moduleSpecifier !== undefined &&
            ts.isStringLiteral(statement.moduleSpecifier)
              ? [statement.moduleSpecifier.text]
              : [],
          )
          .map((specifier) =>
            specifier.startsWith(".")
              ? posix.join(posix.dirname(path), specifier)
              : specifier,
          );
  return {
    path,
    references: (folder) =>
      targets.some(
        (target) => target === folder || target.startsWith(`${folder}/`),
      ),
  };
}
