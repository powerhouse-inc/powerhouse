import {
  accessSync,
  chmodSync,
  constants,
  cpSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  type Stats,
} from "node:fs";
import { join } from "node:path";

export function exists(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false }) !== undefined;
}

/**
 * Copies a file or a tree with its timestamps. A clone where the filesystem
 * has them, a byte copy elsewhere; never a hard link, because later steps
 * rewrite files in place.
 */
export function cloneTree(
  from: string,
  to: string,
  filter?: (source: string) => boolean,
): void {
  cpSync(from, to, {
    recursive: true,
    mode: constants.COPYFILE_FICLONE,
    preserveTimestamps: true,
    verbatimSymlinks: true,
    ...(filter && { filter }),
  });
}

/**
 * Mirrors a tree whose files the next step unlinks before it writes (tsdown
 * cleans its output directory that way): each file is hard linked, so no
 * byte is copied and nothing written later reaches `from`. A file that
 * cannot be linked, and anything else, is copied.
 */
export function linkTree(
  from: string,
  to: string,
  filter: (source: string) => boolean,
): void {
  mkdirSync(to);
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    if (!filter(source)) continue;
    const target = join(to, entry.name);
    if (entry.isDirectory()) {
      linkTree(source, target, filter);
      continue;
    }
    if (entry.isFile()) {
      try {
        linkSync(source, target);
        continue;
      } catch {
        // Another filesystem, or one without hard links: copied below.
      }
    }
    cloneTree(source, target);
  }
}

/** A directory's permission bits, by POSIX path from a tree's root ("" for the root). */
export type DirectoryMode = readonly [path: string, mode: number];

const OWNER_RWX = 0o700;

/**
 * Gives every directory of the tree at `path` that lacks it owner read,
 * write and search permission, which emptying it needs, and returns the
 * modes it changed, parents first.
 */
export function openDirectories(path: string): DirectoryMode[] {
  const changed: DirectoryMode[] = [];
  const visit = (dir: string, rel: string) => {
    const stat = lstatSync(dir, { throwIfNoEntry: false });
    if (!stat?.isDirectory()) return;
    const mode = stat.mode & 0o7777;
    if ((mode & OWNER_RWX) !== OWNER_RWX) {
      chmodSync(dir, mode | OWNER_RWX);
      changed.push([rel, mode]);
    }
    for (const entry of readdirSync(dir)) {
      visit(join(dir, entry), rel === "" ? entry : `${rel}/${entry}`);
    }
  };
  visit(path, "");
  return changed;
}

/** Sets back the modes `openDirectories` changed, children first. */
export function restoreDirectoryModes(
  path: string,
  modes: readonly DirectoryMode[],
): void {
  for (const [rel, mode] of [...modes].reverse()) {
    chmodSync(rel === "" ? path : join(path, ...rel.split("/")), mode);
  }
}

/**
 * Removes a tree. A directory without owner write permission keeps its
 * entries, so on failure each directory is opened and the removal tried
 * once more.
 */
export function removeTree(path: string): void {
  const remove = () =>
    rmSync(path, { recursive: true, force: true, maxRetries: 10 });
  try {
    remove();
  } catch (error) {
    try {
      openDirectories(path);
    } catch {
      throw error;
    }
    remove();
  }
}

type Unstageable = { readonly path: string; readonly reason: string };

/**
 * The first entry of the tree at `path`, itself included, that the stage
 * cannot copy as it is, and why: a FIFO, socket or device, which a copy
 * cannot represent, or a file or directory this process cannot read. Only
 * permissions are checked; no file is read. Entries `filter` rejects, and
 * what they hold, are not looked at.
 */
export function unstageableEntryIn(
  path: string,
  filter: (source: string) => boolean = () => true,
): Unstageable | undefined {
  const visit = (path: string, stat: Stats): Unstageable | undefined => {
    if (stat.isSymbolicLink()) return;
    if (!stat.isFile() && !stat.isDirectory()) {
      return { path, reason: "is not a file, directory or symbolic link" };
    }
    const mode = stat.isDirectory()
      ? constants.R_OK | constants.X_OK
      : constants.R_OK;
    try {
      accessSync(path, mode);
    } catch {
      return { path, reason: "cannot be read" };
    }
    if (!stat.isDirectory()) return;
    for (const entry of readdirSync(path)) {
      const child = join(path, entry);
      if (!filter(child)) continue;
      const found = visit(child, lstatSync(child));
      if (found) return found;
    }
    return;
  };
  const stat = lstatSync(path, { throwIfNoEntry: false });
  return stat && visit(path, stat);
}

export function entriesOf(dir: string): string[] {
  return exists(dir) ? readdirSync(dir) : [];
}

const blocker = new Int32Array(new SharedArrayBuffer(4));

/** Waits without returning to the event loop, so no signal handler runs meanwhile. */
function sleepSync(ms: number): void {
  Atomics.wait(blocker, 0, 0, ms);
}

/** Windows refuses to rename a directory while another process holds a file in it. */
export function isHeldOpen(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "EPERM" || code === "EBUSY" || code === "EACCES";
}

export const RENAME_PATIENCE_MS = 2000;

/** `rename`, retried with backoff for about two seconds while the path is held open. */
export function renamePatiently(
  from: string,
  to: string,
  patienceMs = RENAME_PATIENCE_MS,
): void {
  const deadline = Date.now() + patienceMs;
  for (let wait = 20; ; wait = Math.min(wait * 2, 400)) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      if (!isHeldOpen(error) || Date.now() + wait > deadline) throw error;
      sleepSync(wait);
    }
  }
}

/** Moves each entry of `from` into `to`, replacing what `to` holds under that name. */
export function moveEntries(from: string, to: string): void {
  for (const entry of entriesOf(from)) {
    const target = join(to, entry);
    if (exists(target)) removeTree(target);
    renamePatiently(join(from, entry), target);
  }
}

/** Staging cannot run where the build would write; `message` says why. */
export class CannotStage extends Error {}

// Errors that say a path cannot be created or written there, or that the
// filesystem has no hard links for the lock.
const CANNOT_WRITE = new Set([
  "ENOTDIR",
  "EACCES",
  "EPERM",
  "EROFS",
  "ENOTSUP",
  "EOPNOTSUPP",
]);

/** Runs `create`, turning a refusal to write `where` into `CannotStage`. */
export async function creating<T>(
  where: string,
  create: () => T | Promise<T>,
): Promise<T> {
  try {
    return await create();
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === "string" && CANNOT_WRITE.has(code)) {
      throw new CannotStage(`${where} cannot be written (${code})`);
    }
    throw error;
  }
}
