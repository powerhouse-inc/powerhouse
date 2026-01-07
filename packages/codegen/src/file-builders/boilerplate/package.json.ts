import { getVersioningSchemeFromArgs } from "./utils.js";

type BuildBoilerplatePackageJsonArgs = {
  projectName: string;
  tag?: "dev" | "staging" | "latest";
  version?: string;
  branch?: string;
};
export function buildBoilerplatePackageJson(
  args: BuildBoilerplatePackageJsonArgs,
) {
  const versioningScheme = getVersioningSchemeFromArgs(args);
}
