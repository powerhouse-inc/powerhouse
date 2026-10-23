import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/** The directory in `<modulesDir>/` that `--dir` names, by name or by a path to it or a file in it */
export function resolveModuleDirName(
  projectDir: string,
  modulesDir:
    | "document-models"
    | "editors"
    | "pieces"
    | "processors"
    | "subgraphs",
  dir: string,
  example: string,
) {
  const modulesPath = join(projectDir, modulesDir);
  const moduleDir = [resolve(projectDir, dir), join(modulesPath, dir)]
    .filter((candidate) => existsSync(candidate))
    .map((candidate) =>
      statSync(candidate).isDirectory() ? candidate : dirname(candidate),
    )
    .find((candidate) => dirname(candidate) === modulesPath);
  if (!moduleDir) {
    throw new Error(
      `No directory in ${modulesDir}/ for --dir "${dir}": expected its name ("${example}") or its path ("${modulesDir}/${example}").`,
    );
  }
  return basename(moduleDir);
}
