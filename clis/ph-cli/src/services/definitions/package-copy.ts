import { cpSync, lstatSync, mkdirSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { NON_INPUT_DIRECTORIES } from "./package-revision.js";
import { canonicalPath, pathWithin, scratchDirectory } from "./paths.js";

export function copyPackageForPack(
  packageRoot: string,
  target: string,
  excludedPaths: readonly string[] = [],
): void {
  const excluded = excludedPaths.map((path) =>
    canonicalPath(path, { resolveMissingLinks: true }),
  );
  const scratch = scratchDirectory(packageRoot);
  const destinationRoot = canonicalPath(target, { resolveMissingLinks: true });
  const included = (source: string): boolean =>
    basename(source) !== "node_modules" &&
    (lstatSync(source).isSymbolicLink() ||
      !excluded.some(
        (path) =>
          pathWithin(
            path,
            canonicalPath(source, { resolveMissingLinks: true }),
          ) !== null,
      )) &&
    pathWithin(
      scratch,
      canonicalPath(source, { resolveMissingLinks: true }),
    ) === null;
  const copy = (source: string, destination: string): void => {
    if (!included(source)) return;
    const entry = lstatSync(source);
    // cpSync rejects a descendant destination before applying its filter.
    if (
      entry.isDirectory() &&
      pathWithin(canonicalPath(source), destinationRoot) !== null
    ) {
      mkdirSync(destination, { recursive: true, mode: entry.mode });
      for (const child of readdirSync(source))
        copy(join(source, child), join(destination, child));
      return;
    }
    cpSync(source, destination, {
      recursive: true,
      verbatimSymlinks: true,
      filter: included,
    });
  };
  for (const entry of readdirSync(packageRoot)) {
    if (NON_INPUT_DIRECTORIES.includes(entry)) continue;
    copy(join(packageRoot, entry), join(target, entry));
  }
}
