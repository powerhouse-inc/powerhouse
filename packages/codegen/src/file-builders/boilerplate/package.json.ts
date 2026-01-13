import { packageJsonTemplate } from "@powerhousedao/codegen/templates";
import {
  makeVersionedDependencies,
  VERSIONED_DEPENDENCIES,
  VERSIONED_DEV_DEPENDENCIES,
} from "@powerhousedao/codegen/utils";

export async function buildBoilerplatePackageJson(args: {
  name: string;
  tag?: string;
  version?: string;
}) {
  const { name, tag, version } = args;
  const versionedDependencies = await makeVersionedDependencies({
    names: VERSIONED_DEPENDENCIES,
    tag,
    version,
  });
  const versionedDevDependencies = await makeVersionedDependencies({
    names: VERSIONED_DEV_DEPENDENCIES,
    tag,
    version,
  });

  const template = packageJsonTemplate(
    name,
    versionedDependencies,
    versionedDevDependencies,
  );

  return template;
}
