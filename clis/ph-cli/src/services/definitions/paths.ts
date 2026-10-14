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

export function canonicalConfigFile(configFile: string): string {
  const absolute = resolve(configFile);
  return join(canonicalPath(dirname(absolute)), basename(absolute));
}

export function resolvePackagePaths(request: {
  readonly packageRoot: string;
  readonly outDir: string;
}): { readonly packageRoot: string; readonly outDir: string } {
  const inputRoot = resolve(request.packageRoot);
  const packageRoot = realpathSync.native(inputRoot);
  const output = resolve(inputRoot, request.outDir);
  let outDir = pathWithin(inputRoot, output) ?? pathWithin(packageRoot, output);
  if (outDir === null) {
    let ancestor = output;
    while (dirname(ancestor) !== ancestor) {
      if (lstatSync(ancestor, { throwIfNoEntry: false }) !== undefined) {
        try {
          if (canonicalPath(ancestor) === packageRoot) {
            outDir = relative(ancestor, output);
            break;
          }
        } catch {
          break;
        }
      }
      ancestor = dirname(ancestor);
    }
  }
  return { packageRoot, outDir: outDir ?? relative(packageRoot, output) };
}

export class ScratchDirectoryError extends Error {}

// Where the build's scratch directory lives once `.ph/build` is recreated:
// `.ph` resolved, the final entry not, since a `build` link is replaced.
export function scratchDirectory(packageRoot: string): string {
  let parent: string;
  try {
    parent = canonicalPath(join(packageRoot, ".ph"), {
      resolveMissingLinks: true,
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ELOOP") {
      throw new ScratchDirectoryError(
        `Directory symlink cycle at ".ph"; package inputs cannot be read.`,
      );
    }
    throw error;
  }
  if (pathWithin(canonicalPath(packageRoot), parent) === null) {
    throw new ScratchDirectoryError(
      `ph build never writes outside the package root; .ph resolves to ${JSON.stringify(parent)}.`,
    );
  }
  return join(parent, "build");
}
