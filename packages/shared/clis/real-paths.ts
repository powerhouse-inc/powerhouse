import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

/**
 * The absolute path with symlinks, and case where the filesystem ignores it,
 * resolved as far as the path exists, so a path not written yet is judged
 * against its real parent. A dangling symlink resolves to where it points:
 * it is not where the path lives, and following it is what a later write
 * through it does.
 */
export function realPathThroughExistingParent(path: string): string {
  const absolute = resolve(path);
  let ancestor = absolute;
  while (lstatSync(ancestor, { throwIfNoEntry: false }) === undefined) {
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  let real: string;
  try {
    real = realpathSync.native(ancestor);
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error && error.code === "ENOENT") ||
      !lstatSync(ancestor, { throwIfNoEntry: false })?.isSymbolicLink()
    )
      throw error;
    real = realPathThroughExistingParent(
      resolve(dirname(ancestor), readlinkSync(ancestor)),
    );
  }
  return resolve(real, relative(ancestor, absolute));
}

/** `path` relative to `root` when it is `root` or inside it, else null. */
export function pathWithin(root: string, path: string): string | null {
  const inside = relative(root, path);
  return inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)
    ? null
    : inside;
}
