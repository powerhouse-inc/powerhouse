import chalk from "chalk";
import type { Agent } from "package-manager-detector";
import { readPackage } from "read-pkg";
import { clean, valid } from "semver";
import { spawnAsync } from "./spawn-async.js";

export async function fetchNpmVersionFromRegistryForTag(
  packageName: string,
  tag: string,
) {
  // npm will assume tag is `"latest"` unless otherwise specified
  const packageAtTag = `${packageName}@${tag}`;

  const version = await fetchPackageVersionFromNpmRegistry(packageAtTag);
  const cleanedVersion = clean(version);

  if (!cleanedVersion) {
    throw new Error(
      `Failed to fetch version for package "${packageName}" at tag "${tag}".`,
    );
  }
  return cleanedVersion;
}

export async function fetchPackageVersionFromNpmRegistry(
  packageSpecifier: string,
) {
  const failedFetchErrorMessage = `Failed to fetch version from npm registry for ${packageSpecifier}.`;
  try {
    const version = await spawnAsync("npm", [
      "view",
      packageSpecifier,
      "version",
    ]);
    return version;
  } catch (e) {
    console.error(failedFetchErrorMessage);
    const error = e instanceof Error ? e : new Error("Unknown error");
    throw error;
  }
}

export async function parsePackageVersion(args: {
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
  const version = await parsePackageVersion(args);
  return `"${args.name}": "${version}"`;
}

export function parseTag(args: {
  tag?: string;
  dev?: boolean;
  staging?: boolean;
}) {
  const { tag, dev, staging } = args;
  if (tag) return tag;
  if (dev) return "dev";
  if (staging) return "staging";
  return "latest";
}

export function parsePackageManager(args?: {
  packageManager?: Agent;
  npm?: boolean;
  pnpm?: boolean;
  yarn?: boolean;
  bun?: boolean;
}): Agent | undefined {
  const { npm, pnpm, yarn, bun, packageManager } = args ?? {};
  if (npm) return "npm";
  if (pnpm) return "pnpm";
  if (yarn) return "yarn";
  if (bun) return "bun";
  if (packageManager) return packageManager;
  return undefined;
}

export function handleMutuallyExclusiveOptions(
  options: Record<string, string | boolean | number | undefined>,
  optionsName: string,
) {
  const mutuallyExclusiveOptions = Object.entries(options)
    .map(([k, v]) => {
      if (v !== undefined) return k;
      return undefined;
    })
    .filter((v) => v !== undefined);

  if (mutuallyExclusiveOptions.length > 1) {
    throw new Error(
      `Cannot specify multiple ${optionsName} options. You provided: ${mutuallyExclusiveOptions.join(", ")}`,
    );
  }
}

export function getTagFromVersion(version: string) {
  if (version.includes("dev")) return "dev";
  if (version.includes("staging")) return "staging";
  return "latest";
}

export function logVersionUpdate(args: {
  name: string;
  version: string;
  newVersion: string;
}) {
  const { name, version, newVersion } = args;
  console.log(
    `⚙️ Updating ${chalk.bold(name)}: ${chalk.blue(version)} -> ${chalk.green(newVersion)}`,
  );
}

export async function getPackageVersionFromPackageJson(
  packageJsonPath: string,
) {
  const packageJson = await readPackage({ cwd: packageJsonPath });
  const version = packageJson.version;
  return version;
}
