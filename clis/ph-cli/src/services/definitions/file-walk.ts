import { spawnSync } from "node:child_process";
import { lstatSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { canonicalPath, pathWithin } from "./paths.js";

export class PackageRevisionError extends Error {
  constructor(path: string) {
    super(
      `Directory symlink cycle at ${JSON.stringify(path)}; package inputs cannot be read.`,
    );
    this.name = "PackageRevisionError";
  }
}

function gitVisibleFiles(root: string) {
  const listed = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  if (listed.status !== 0) return undefined;
  const files = new Set(
    listed.stdout.split("\0").filter((path) => path !== ""),
  );
  const directories = new Set<string>();
  for (const file of files)
    for (let parent = dirname(file); parent !== "."; parent = dirname(parent))
      directories.add(parent.split(sep).join("/"));
  return { files, directories };
}

export function walkFiles(
  root: string,
  options: {
    readonly excludedPaths?: readonly string[];
    readonly excludedDirectoryNames?: readonly string[];
    readonly respectGitignore?: boolean;
    readonly preserveSymlinks?: boolean;
  } = {},
): string[] {
  if (statSync(root, { throwIfNoEntry: false }) === undefined) return [];
  const excluded = options.excludedPaths ?? [];
  const excludedNames = new Set(options.excludedDirectoryNames ?? []);
  const visible = options.respectGitignore ? gitVisibleFiles(root) : undefined;
  const files: string[] = [];
  const ancestors = new Set([canonicalPath(root)]);
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory).sort()) {
      if (excludedNames.has(entry)) continue;
      const path = join(directory, entry);
      const packagePath = relative(root, path).split(sep).join("/");
      if (
        visible !== undefined &&
        !visible.files.has(packagePath) &&
        !visible.directories.has(packagePath)
      )
        continue;
      try {
        if (options.preserveSymlinks && lstatSync(path).isSymbolicLink()) {
          const canonical = canonicalPath(path, { resolveMissingLinks: true });
          if (!excluded.some((root) => pathWithin(root, canonical) !== null))
            files.push(path);
          continue;
        }
        const stats = statSync(path, { throwIfNoEntry: false });
        if (stats === undefined) continue;
        const canonical = canonicalPath(path);
        if (excluded.some((root) => pathWithin(root, canonical) !== null))
          continue;
        if (stats.isDirectory()) {
          if (
            ancestors.has(canonical) ||
            (visible !== undefined && !visible.directories.has(packagePath))
          )
            continue;
          ancestors.add(canonical);
          try {
            walk(path);
          } finally {
            ancestors.delete(canonical);
          }
        } else if (
          stats.isFile() &&
          (visible === undefined || visible.files.has(packagePath))
        )
          files.push(path);
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        )
          continue;
        if (error instanceof Error && "code" in error && error.code === "ELOOP")
          throw new PackageRevisionError(packagePath);
        throw error;
      }
    }
  };
  walk(root);
  return files;
}
