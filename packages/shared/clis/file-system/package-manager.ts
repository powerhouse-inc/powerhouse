import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";
import type { Agent } from "package-manager-detector";

const SUPPORTED: readonly Agent[] = ["npm", "pnpm", "yarn", "bun"];

/** Checked on PATH in this order when no user agent names a manager. */
const PATH_PREFERENCE: readonly Agent[] = ["bun", "pnpm"];

export type PackageManagerSource = "user-agent" | "path" | "fallback";

export interface DetectPackageManagerOptions {
  /** Defaults to `process.env`. Reads npm_config_user_agent, PATH, PATHEXT. */
  env?: NodeJS.ProcessEnv;
  /** Defaults to `process.platform`. */
  platform?: NodeJS.Platform;
  /** Managers the caller can work with. Defaults to npm, pnpm, yarn, bun. */
  allowed?: readonly Agent[];
}

/**
 * Picks a package manager when the user passed no --npm/--pnpm/--yarn/--bun
 * flag. In order:
 *   1. the manager that launched us (`npm_config_user_agent`, set by
 *      npx / pnpm dlx / yarn dlx / bunx and by package scripts)
 *   2. bun, then pnpm, if found on PATH
 *   3. npm
 */
export function detectPackageManager(
  options: DetectPackageManagerOptions = {},
): { pm: Agent; source: PackageManagerSource } {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const allowed = options.allowed ?? SUPPORTED;

  const fromUserAgent = env.npm_config_user_agent
    ?.split(" ")[0]
    ?.split("/")[0] as Agent | undefined;
  if (fromUserAgent && allowed.includes(fromUserAgent)) {
    return { pm: fromUserAgent, source: "user-agent" };
  }

  for (const pm of PATH_PREFERENCE) {
    if (allowed.includes(pm) && isOnPath(pm, env, platform)) {
      return { pm, source: "path" };
    }
  }

  return { pm: "npm", source: "fallback" };
}

function isOnPath(
  bin: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): boolean {
  const isWindows = platform === "win32";
  // Windows env var names are case-insensitive; Node exposes them as given.
  const pathValue = isWindows
    ? Object.entries(env).find(([k]) => k.toUpperCase() === "PATH")?.[1]
    : env.PATH;
  if (!pathValue) return false;

  const extensions = isWindows
    ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""];
  const dirs = pathValue.split(isWindows ? ";" : ":").filter(Boolean);

  return dirs.some((dir) =>
    extensions.some((ext) =>
      isExecutableFile(path.join(dir, bin + ext), isWindows),
    ),
  );
}

function isExecutableFile(file: string, isWindows: boolean): boolean {
  try {
    if (!statSync(file).isFile()) return false;
    // Windows has no execute bit; PATHEXT already decides what runs.
    if (!isWindows) accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
