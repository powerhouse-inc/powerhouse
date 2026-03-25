import {
    makeVersionedDependencies,
    VERSIONED_DEPENDENCIES,
    VERSIONED_DEV_DEPENDENCIES,
} from "@powerhousedao/shared/clis";
import { packageJsonTemplate } from "templates";

export async function buildBoilerplatePackageJson(args: {
  name: string;
  tag?: string;
  version?: string;
  workspace?: boolean;
}) {
  const { name, tag, version, workspace } = args;
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
