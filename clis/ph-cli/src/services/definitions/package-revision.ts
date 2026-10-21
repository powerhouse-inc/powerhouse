import { getVersion } from "../../get-version.js";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  statSync,
} from "node:fs";
import { relative, resolve, sep } from "node:path";
import {
  canonicalPath,
  resolvePackagePaths,
  scratchDirectory,
} from "./paths.js";
import { walkFiles } from "./file-walk.js";
export { PackageRevisionError } from "./file-walk.js";

export const NON_INPUT_DIRECTORIES: readonly string[] = [
  "node_modules",
  ".git",
  ".ph",
  ".tsbuild",
  ".turbo",
  ".vite",
];

type PackageRevisionInput = {
  readonly packageRoot: string;
  readonly excludedPaths?: readonly string[];
  readonly excludedDirectoryNames?: readonly string[];
  readonly respectGitignore?: boolean;
  readonly preserveSymlinks?: boolean;
  readonly bindings: Readonly<Record<string, string>>;
};

export function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}

export function filesDigest(
  root: string,
  paths: readonly string[],
): `sha256:${string}` {
  const entries = paths.map((path) => {
    const file = resolve(root, path);
    const stats = statSync(file, { throwIfNoEntry: false });
    const digest = stats?.isFile()
      ? createHash("sha256").update(readFileSync(file)).digest("hex")
      : "absent";
    return [path, digest] as const;
  });
  return fileEntriesDigest(entries);
}

export function fileEntriesDigest(
  entries: readonly (readonly [string, string])[],
): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(entries.map(([path, digest]) => `${path} ${digest}`).join("\n"))
    .digest("hex")}`;
}

export function computePackageRevision(
  input: PackageRevisionInput,
): `sha256:${string}` {
  const excluded = (input.excludedPaths ?? []).map((path) =>
    canonicalPath(resolve(input.packageRoot, path)),
  );
  const entries = walkFiles(input.packageRoot, {
    excludedPaths: excluded,
    excludedDirectoryNames:
      input.excludedDirectoryNames ?? NON_INPUT_DIRECTORIES,
    respectGitignore: input.respectGitignore,
    preserveSymlinks: input.preserveSymlinks,
  }).map(
    (path) =>
      `${toPosixPath(relative(input.packageRoot, path))} ${createHash("sha256")
        .update(
          input.preserveSymlinks && lstatSync(path).isSymbolicLink()
            ? `symlink:${readlinkSync(path)}`
            : readFileSync(path),
        )
        .digest("hex")}`,
  );
  for (const key of Object.keys(input.bindings).sort()) {
    entries.push(`binding:${key} ${input.bindings[key]}`);
  }
  return `sha256:${createHash("sha256").update(entries.join("\n")).digest("hex")}`;
}

export function directoryDigest(root: string): string {
  return existsSync(root)
    ? computePackageRevision({
        packageRoot: root,
        excludedDirectoryNames: [],
        preserveSymlinks: true,
        bindings: {},
      })
    : "absent";
}

export function packageRevisionOf(
  packageRoot: string,
  outDir: string,
  outputs: readonly string[] = [],
): `sha256:${string}` {
  const paths = resolvePackagePaths({ packageRoot, outDir });
  return computePackageRevision({
    packageRoot: paths.packageRoot,
    excludedPaths: [
      paths.outDir,
      ...outputs,
      scratchDirectory(paths.packageRoot),
    ],
    respectGitignore: true,
    bindings: { compiler: getVersion() },
  });
}
