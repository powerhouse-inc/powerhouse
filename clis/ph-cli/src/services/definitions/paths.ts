import { lstatSync, realpathSync } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

export function canonicalPath(path: string): string {
  const absolute = resolve(path);
  let ancestor = absolute;
  while (lstatSync(ancestor, { throwIfNoEntry: false }) === undefined) {
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  return resolve(realpathSync.native(ancestor), relative(ancestor, absolute));
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
