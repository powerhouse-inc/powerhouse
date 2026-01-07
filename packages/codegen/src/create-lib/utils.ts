import { execSync } from "child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const packageManagers = ["npm", "yarn", "pnpm", "bun"] as const;
const defaultPackageManager = "npm";

export type PackageManager = (typeof packageManagers)[number];

export function getPackageManager(userAgent?: string): PackageManager {
  if (!userAgent) {
    return defaultPackageManager;
  }

  const pkgSpec = userAgent.split(" ")[0];
  const pkgSpecArr = pkgSpec.split("/");
  const name = pkgSpecArr[0];

  if (packageManagers.includes(name as PackageManager)) {
    return name as PackageManager;
  } else {
    return defaultPackageManager;
  }
}

export const envPackageManager = getPackageManager(
  process.env.npm_config_user_agent,
);

export function runCmd(command: string) {
  try {
    execSync(command, { stdio: "inherit" });
  } catch (error) {
    console.log("\x1b[31m", error, "\x1b[0m");
    throw error;
  }
}

export async function writeFileEnsuringDir(
  filePath: string,
  contents: string | Buffer,
) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, { encoding: "utf-8" });
}
