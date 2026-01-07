import type { BuildBoilerplatePackageJsonArgs } from "./types.js";
import { getVersioningScheme } from "./utils.js";

export function buildBoilerplatePackageJson(
  args: BuildBoilerplatePackageJsonArgs,
) {
  const versioningScheme = getVersioningScheme(args);
}
