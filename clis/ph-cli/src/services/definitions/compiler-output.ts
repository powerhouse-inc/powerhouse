import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalPath } from "./paths.js";

export function listedFiles(stdout = "", directory = "."): string[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .map((line) => resolve(directory, line))
    .filter((line) => existsSync(line) && statSync(line).isFile());
}

export function explainedRoots(stdout: string, directory: string): string[] {
  const roots: string[] = [];
  let file: string | undefined;
  for (const line of stdout.split("\n")) {
    if (
      line !== "" &&
      line === line.trim() &&
      /\.(?:[cm]?[jt]sx?|json)$/i.test(line)
    ) {
      const path = resolve(directory, line);
      file = statSync(path, { throwIfNoEntry: false })?.isFile()
        ? path
        : undefined;
    } else if (
      file !== undefined &&
      /Root file specified|Part of 'files' list|Matched by (default )?include pattern/.test(
        line,
      )
    ) {
      roots.push(file);
    }
  }
  return roots;
}

export function tracedResolutions(
  stdout: string,
): ReadonlyMap<string, ReadonlyMap<string, string>> {
  const resolutions = new Map<string, Map<string, string>>();
  let source: string | undefined;
  for (const line of stdout.split("\n")) {
    const from = /^======== Resolving module '(.+)' from '(.+)'\./.exec(line);
    if (from?.[2] !== undefined) source = canonicalPath(from[2]);
    const resolved =
      /^======== Module name '(.+?)' was successfully resolved to '(.+?)'(?: with Package ID '.*')?\. ========$/.exec(
        line,
      );
    if (source !== undefined && resolved !== null) {
      const imports = resolutions.get(source) ?? new Map<string, string>();
      imports.set(resolved[1], canonicalPath(resolved[2]));
      resolutions.set(source, imports);
    }
  }
  return resolutions;
}
