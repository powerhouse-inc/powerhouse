import { packageJsonTemplate } from "@powerhousedao/codegen/templates";
import { makeVersionedDependencies } from "../utils.js";
import {
  VERSIONED_DEPENDENCIES,
  VERSIONED_DEV_DEPENDENCIES,
} from "./constants.js";
import type { BuildBoilerplatePackageJsonArgs } from "../types.js";

export async function buildBoilerplatePackageJson(
  args: BuildBoilerplatePackageJsonArgs,
) {
  const { projectName } = args;
  const versionedDependencies = await makeVersionedDependencies(
    VERSIONED_DEPENDENCIES,
    args,
  );
  const versionedDevDependencies = await makeVersionedDependencies(
    VERSIONED_DEV_DEPENDENCIES,
    args,
  );

  const template = packageJsonTemplate(
    projectName,
    versionedDependencies,
    versionedDevDependencies,
  );

  return template;
}
