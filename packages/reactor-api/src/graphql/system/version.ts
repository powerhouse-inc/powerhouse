import { execSync } from "node:child_process";

let cachedVersion: string | undefined;
let cachedGitHash: string | undefined;

export function getVersion(): string {
  if (cachedVersion !== undefined) return cachedVersion;
  cachedVersion =
    process.env.PH_VERSION ?? process.env.npm_package_version ?? "unknown";
  return cachedVersion;
}

export function getGitHash(): string {
  if (cachedGitHash !== undefined) return cachedGitHash;
  if (process.env.PH_GIT_SHA) {
    cachedGitHash = process.env.PH_GIT_SHA;
    return cachedGitHash;
  }
  try {
    cachedGitHash = execSync("git rev-parse HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    cachedGitHash = "unknown";
  }
  return cachedGitHash;
}
