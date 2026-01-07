import { spawn } from "node:child_process";
import { clean, valid } from "semver";
import type { VersioningSchemes } from "./types.js";

export function spawnAsync(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const cmd =
      process.platform === "win32" && command === "npm" ? "npm.cmd" : command;

    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });

    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(
          new Error(stderr.trim() || `${command} exited with code ${code}`),
        );
      }
    });
  });
}

export async function fetchNpmVersionFromRegistryForTag(
  packageName: string,
  tag: string,
) {
  tag = tag || "latest";
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

export function getVersioningScheme(
  schemes: VersioningSchemes,
): keyof VersioningSchemes {
  const tag = schemes["tag"];
  const version = schemes["version"];
  if (tag !== undefined && version !== undefined) {
    throw new Error(
      `Cannot use more than one versioning scheme. Use either --tag or --version`,
    );
  }
  if (version !== undefined) return "version";
  return "tag";
}

export async function getPackageVersion(
  packageName: string,
  schemes: VersioningSchemes,
) {
  const scheme = getVersioningScheme(schemes);
  if (scheme === "version") {
    const semverVersion = schemes["version"];
    if (!semverVersion || !valid(clean(semverVersion))) {
      throw new Error(`Invalid version specified: ${semverVersion}`);
    }
    return semverVersion;
  }
  const specifiedTag = schemes["tag"] ?? "";
  const versionForTag = await fetchNpmVersionFromRegistryForTag(
    packageName,
    specifiedTag,
  );
  return versionForTag;
}

export async function makeVersionedDependencies(
  packageNames: string[],
  schemes: VersioningSchemes,
) {
  return await Promise.all(
    packageNames.map((packageName) =>
      makeVersionedDependency(packageName, schemes),
    ),
  );
}

async function makeVersionedDependency(
  packageName: string,
  schemes: VersioningSchemes,
) {
  const version = await getPackageVersion(packageName, schemes);
  return `"${packageName}": "${version}"`;
}
