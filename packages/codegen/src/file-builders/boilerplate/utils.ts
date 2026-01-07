import { spawn } from "node:child_process";
import { clean } from "semver";

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

export async function fetchNpmVersionFromRegistry(
  packageName: string,
  tag: "dev" | "staging" | "latest" | "",
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
  return `^${cleanedVersion}`;
}
