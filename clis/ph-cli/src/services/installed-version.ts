import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { lt, valid } from "semver";
import { getVersion } from "../get-version.js";

/** The version of `packageName` that Node resolves from `projectDir`. */
function installedVersion(
  projectDir: string,
  packageName: string,
): string | undefined {
  for (let dir = projectDir; ; dir = dirname(dir)) {
    const manifest = join(dir, "node_modules", packageName, "package.json");
    if (existsSync(manifest)) {
      const { version } = JSON.parse(readFileSync(manifest, "utf8")) as {
        version?: unknown;
      };
      return typeof version === "string" ? version : undefined;
    }
    if (dirname(dir) === dir) return undefined;
  }
}

/**
 * Why the code `ph migrate` writes cannot run against the project's
 * `packageName`, or undefined when it can: the project must have the package
 * at this ph-cli's version or later. Unknown versions are not checked.
 */
export function outdatedDependency(
  projectDir: string,
  packageName: string,
): string | undefined {
  const required = getVersion();
  if (valid(required) === null) return undefined;
  const installed = installedVersion(projectDir, packageName);
  if (installed === undefined) {
    return `${packageName} is not installed in this project. Install the project's dependencies, then migrate again.`;
  }
  if (valid(installed) === null || !lt(installed, required)) return undefined;
  return `This project has ${packageName} ${installed}, and what this ph migrate converts to code-first needs ${required} or later. Run ph migrate ${required} to upgrade the Powerhouse packages, then convert again.`;
}
