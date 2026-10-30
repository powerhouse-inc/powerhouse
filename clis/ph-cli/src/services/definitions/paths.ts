import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

export function canonicalPath(
  path: string,
  options: { readonly resolveMissingLinks?: boolean } = {},
): string {
  const absolute = resolve(path);
  let ancestor = absolute;
  while (lstatSync(ancestor, { throwIfNoEntry: false }) === undefined) {
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  let canonical: string;
  try {
    canonical = realpathSync.native(ancestor);
  } catch (error) {
    if (
      options.resolveMissingLinks !== true ||
      !(error instanceof Error && "code" in error && error.code === "ENOENT") ||
      !lstatSync(ancestor, { throwIfNoEntry: false })?.isSymbolicLink()
    )
      throw error;
    canonical = canonicalPath(
      resolve(dirname(ancestor), readlinkSync(ancestor)),
      options,
    );
  }
  return resolve(canonical, relative(ancestor, absolute));
}

export function pathWithin(root: string, path: string): string | null {
  const inside = relative(root, path);
  return inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)
    ? null
    : inside;
}

export function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}

export function canonicalConfigFile(configFile: string): string {
  const absolute = resolve(configFile);
  return join(canonicalPath(dirname(absolute)), basename(absolute));
}
