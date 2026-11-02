import {
  BOILERPLATE_DEPENDENCY_OVERRIDES,
  externalDevDependencies,
  makeVersionedDependenciesMap,
  PEER_EXTERNAL_DEPENDENCIES,
  VERSIONED_DEV_DEPENDENCIES,
  VERSIONED_PEER_DEPENDENCIES,
} from "@powerhousedao/shared/clis";
import { mapValues } from "remeda";
import { packageJsonTemplate } from "templates";

/**
 * The scaffold's dependency pins, in the field each package manager reads.
 * yarn, bun and pnpm 10 read `resolutions`. npm and bun read `overrides`,
 * where `$name` follows the project's own exact devDependency: a literal
 * version fails with EOVERRIDE once the package is also a direct dependency.
 * pnpm 11 and later read only `overrides` in pnpm-workspace.yaml.
 */
export function pinFields(
  pins: Record<string, string> = BOILERPLATE_DEPENDENCY_OVERRIDES,
) {
  return {
    resolutions: { ...pins },
    overrides: mapValues(pins, (_, name) => `$${name}`),
  };
}

export async function buildBoilerplatePackageJson(args: {
  name: string;
  tag?: string;
  version?: string;
  workspace?: boolean;
}) {
  const { name, tag, version } = args;
  const workspacePeers = await makeVersionedDependenciesMap({
    names: VERSIONED_PEER_DEPENDENCIES,
    tag,
    version,
  });
  const workspaceDevs = await makeVersionedDependenciesMap({
    names: VERSIONED_DEV_DEPENDENCIES,
    tag,
    version,
  });

  const peerDependencies: Record<string, string> = {
    ...workspacePeers,
    ...mapValues(PEER_EXTERNAL_DEPENDENCIES, (v) => v.peer),
  };
  // Pin every peer in devDependencies too so local builds resolve the exact
  // versions the package was peer-tested against.
  const devDependencies: Record<string, string> = {
    ...workspaceDevs,
    ...workspacePeers,
    ...mapValues(PEER_EXTERNAL_DEPENDENCIES, (v) => v.dev),
    ...externalDevDependencies,
    ...BOILERPLATE_DEPENDENCY_OVERRIDES,
  };
  return packageJsonTemplate(
    name,
    peerDependencies,
    devDependencies,
    pinFields().resolutions,
    pinFields().overrides,
  );
}
