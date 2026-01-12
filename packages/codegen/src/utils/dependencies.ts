import { clean, valid } from "semver";
import { spawnAsync } from "./spawn-async.js";

export async function fetchNpmVersionFromRegistryForTag(
  packageName: string,
  tag: string,
) {
  // npm will assume tag is `"latest"` unless otherwise specified
  const packageAtTag = `${packageName}@${tag}`;

  const version = await spawnAsync("npm", ["view", packageAtTag, "version"]);

  const cleanedVersion = clean(version);

  if (!cleanedVersion) {
    throw new Error(
      `Failed to fetch version for package "${packageName}" at tag "${tag}".`,
    );
  }

  // Add ^ prefix to allow semver range updates with ph update
  return cleanedVersion;
}

export async function getPackageVersion(args: {
  name: string;
  version?: string;
  tag?: string;
}) {
  if (args.version) {
    if (!valid(clean(args.version))) {
      throw new Error(`Invalid version specified: ${args.version}`);
    }
    return args.version;
  }

  const versionForTag = await fetchNpmVersionFromRegistryForTag(
    args.name,
    args.tag ?? "latest",
  );
  return versionForTag;
}

export async function makeVersionedDependencies(args: {
  names: string[];
  version?: string;
  tag?: string;
}) {
  return await Promise.all(
    args.names.map((name) =>
      makeVersionedDependency({
        name,
        ...args,
      }),
    ),
  );
}

async function makeVersionedDependency(args: {
  name: string;
  version?: string;
  tag?: string;
}) {
  const version = await getPackageVersion(args);
  return `"${args.name}": "${version}"`;
}
