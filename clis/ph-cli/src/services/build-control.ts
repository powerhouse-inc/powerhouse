import { basename, join, posix, sep } from "node:path";

/** Scratch space of `ph build`, per package. */
export const BUILD_DIRECTORY = join(".ph", "build");
export const LOCK_FILE = join(BUILD_DIRECTORY, "lock");

export const takeoverPrefix = (lockName: string) => `${lockName}.takeover-`;
export const pendingPrefix = (fileName: string) => `.${fileName}.`;

export function isBuildLockFile(path: string): boolean {
  const lockName = basename(LOCK_FILE);
  const name = posix.basename(path);
  return (
    posix.dirname(path) === BUILD_DIRECTORY.split(sep).join("/") &&
    (name === lockName ||
      name.startsWith(takeoverPrefix(lockName)) ||
      name.startsWith(pendingPrefix(lockName)))
  );
}
