import {
  externalDevDependencies,
  makeVersionedDependenciesMap,
  PEER_EXTERNAL_DEPENDENCIES,
  VERSIONED_DEV_DEPENDENCIES,
  VERSIONED_PEER_DEPENDENCIES,
} from "@powerhousedao/shared/clis";
import { mapValues } from "remeda";
import { packageJsonTemplate } from "templates";

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
  };

  return packageJsonTemplate(name, peerDependencies, devDependencies);
}
