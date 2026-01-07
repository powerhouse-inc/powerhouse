import { format } from "prettier";
import { packageJsonTemplate } from "../../templates/boilerplate/package.json.js";
import {
  VERSIONED_DEPENDENCIES,
  VERSIONED_DEV_DEPENDENCIES,
} from "./constants.js";
import type { BuildBoilerplatePackageJsonArgs } from "./types.js";
import { makeVersionedDependencies } from "./utils.js";

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

  const formattedTemplate = await format(template, {
    parser: "json",
  });

  return formattedTemplate;
}
