import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";

/** Directories that never hold the package's own sources. */
const SKIPPED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".ph",
  ".git",
  ".turbo",
  ".vite",
  ".tsbuild",
  "coverage",
]);

export const toPosix = (path: string) => path.split(sep).join("/");

export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Whether git ignores a file or directory, by project-relative POSIX path.
 * In a git work tree, the project's files are those `git ls-files` lists from
 * its directory: tracked ones, and untracked ones git does not ignore.
 * Outside a work tree, without git, or when git lists nothing there, as for a
 * project in an ignored directory of another repository, nothing is ignored.
 */
export function ignoredByGit(projectDir: string): (path: string) => boolean {
  const listed = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: projectDir,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  if (listed.status !== 0) return () => false;
  // Each listed file and the directories above it, which a walk enters.
  const kept = new Set<string>();
  for (const file of listed.stdout.split("\0")) {
    for (
      let path = file;
      path !== "" && path !== "." && !kept.has(path);
      path = posix.dirname(path)
    ) {
      kept.add(path);
    }
  }
  return kept.size === 0 ? () => false : (path) => !kept.has(path);
}

/**
 * The package's files whose names match `pattern`, by project-relative POSIX
 * path. Paths git ignores, such as build copies of sources, are left out.
 */
export function readProjectFiles(
  projectDir: string,
  pattern: RegExp,
): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const ignored = ignoredByGit(projectDir);
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const local = toPosix(relative(projectDir, path));
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name) && !ignored(local)) visit(path);
      } else if (
        entry.isFile() &&
        pattern.test(entry.name) &&
        !ignored(local)
      ) {
        files.set(local, readFileSync(path));
      }
    }
  };
  visit(projectDir);
  return files;
}

/** A file a migration writes, or deletes when `after` is null. */
export type FileChange = {
  readonly path: string;
  readonly after: string | null;
};

/** Each original file's contents and permissions, or null when it does not exist. */
export type FileBackup = ReadonlyMap<
  string,
  { readonly bytes: Buffer; readonly mode: number } | null
>;

/** Refuses links the source inventory cannot represent without following them. */
export function assertChangesWritable(
  projectDir: string,
  changes: readonly { readonly path: string }[],
): void {
  const root = resolve(projectDir);
  for (const { path } of changes) {
    let current = resolve(root, path);
    const local = relative(root, current);
    if (
      local === "" ||
      local === ".." ||
      local.startsWith(`..${sep}`) ||
      isAbsolute(local)
    ) {
      throw new Error(`${path} is not a file inside this project.`);
    }
    while (current !== root) {
      if (lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) {
        throw new Error(
          `${toPosix(relative(root, current))} is a symbolic link. Replace it with a regular project file or directory before migrating; its target was not changed.`,
        );
      }
      current = dirname(current);
    }
  }
}

/**
 * Writes `changes` and returns the bytes they replaced. When a write fails,
 * everything already written is restored before the error is rethrown.
 */
export function writeChanges(
  projectDir: string,
  changes: readonly FileChange[],
): FileBackup {
  assertChangesWritable(projectDir, changes);
  const backup = new Map<
    string,
    { readonly bytes: Buffer; readonly mode: number } | null
  >();
  for (const { path } of changes) {
    const absolute = join(projectDir, path);
    backup.set(
      path,
      existsSync(absolute)
        ? {
            bytes: readFileSync(absolute),
            mode: lstatSync(absolute).mode & 0o7777,
          }
        : null,
    );
  }
  try {
    for (const change of changes) put(projectDir, change.path, change.after);
  } catch (error) {
    restoreChanges(projectDir, backup);
    throw error;
  }
  return backup;
}

/** Restores the contents and permissions `writeChanges` replaced. */
export function restoreChanges(projectDir: string, backup: FileBackup) {
  for (const [path, file] of backup) {
    put(projectDir, path, file?.bytes ?? null);
    if (file !== null) chmodSync(join(projectDir, path), file.mode);
  }
}

function put(projectDir: string, path: string, bytes: string | Buffer | null) {
  const absolute = join(projectDir, path);
  if (bytes === null) {
    rmSync(absolute, { force: true });
    removeEmptyParents(projectDir, dirname(absolute));
  } else {
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, bytes);
  }
}

/** Removes `dir` and its parents while they are empty, up to the project. */
function removeEmptyParents(projectDir: string, dir: string) {
  let current = dir;
  while (current.startsWith(projectDir) && current !== projectDir) {
    if (!existsSync(current) || readdirSync(current).length > 0) return;
    rmdirSync(current);
    current = dirname(current);
  }
}
