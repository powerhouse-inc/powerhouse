import spawn from "cross-spawn";
import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";
import type { Agent } from "package-manager-detector";
import coerce from "semver/functions/coerce.js";
import gte from "semver/functions/gte.js";

const SUPPORTED: readonly Agent[] = ["npm", "pnpm", "yarn", "bun"];

/** Checked on PATH in this order when no user agent names a manager. */
const PATH_PREFERENCE: readonly Agent[] = ["bun", "pnpm"];

/**
 * Oldest version detection will pick. `ph init` passes `--allow-build=<pkg>`
 * to `pnpm dlx` (injectPnpmAllowBuilds), which pnpm accepts from 10.14.0;
 * older versions fail with ERR_PNPM_SPEC_NOT_SUPPORTED_BY_ANY_RESOLVER.
 * An explicit --pnpm still uses whatever pnpm is installed.
 */
const MIN_VERSION: Partial<Record<Agent, string>> = { pnpm: "10.14.0" };

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
 * A manager older than its MIN_VERSION is skipped. A version-manager shim
 * (corepack, asdf, mise) on PATH counts as installed if `--version` works.
 */
export function detectPackageManager(
  options: DetectPackageManagerOptions = {},
): { pm: Agent; source: PackageManagerSource } {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const allowed = options.allowed ?? SUPPORTED;

  const [uaName, uaVersion] =
    env.npm_config_user_agent?.split(" ")[0]?.split("/") ?? [];
  const fromUserAgent = uaName as Agent | undefined;
  if (
    fromUserAgent &&
    allowed.includes(fromUserAgent) &&
    isRecentEnough(fromUserAgent, uaVersion)
  ) {
    return { pm: fromUserAgent, source: "user-agent" };
  }

  for (const pm of PATH_PREFERENCE) {
    if (!allowed.includes(pm)) continue;
    const file = findOnPath(pm, env, platform);
    if (!file) continue;
    if (MIN_VERSION[pm] && !isRecentEnough(pm, readVersion(file, env))) {
      continue;
    }
    return { pm, source: "path" };
  }

  return { pm: "npm", source: "fallback" };
}

function isRecentEnough(pm: Agent, version: string | undefined): boolean {
  const min = MIN_VERSION[pm];
  if (!min) return true;
  const parsed = version ? coerce(version) : null;
  return parsed !== null && gte(parsed, min);
}

function readVersion(file: string, env: NodeJS.ProcessEnv): string | undefined {
  const result = spawn.sync(file, ["--version"], {
    encoding: "utf8",
    env,
    timeout: 10_000,
  });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function findOnPath(
  bin: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string | undefined {
  const isWindows = platform === "win32";
  // Windows env var names are case-insensitive; Node exposes them as given.
  const pathValue = isWindows
    ? Object.entries(env).find(([k]) => k.toUpperCase() === "PATH")?.[1]
    : env.PATH;
  if (!pathValue) return undefined;

  const extensions = isWindows
    ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""];
  // Empty entries mean the current directory; never search it.
  const dirs = pathValue.split(isWindows ? ";" : ":").filter(Boolean);

  for (const dir of dirs) {
    for (const ext of extensions) {
      const file = path.join(dir, bin + ext);
      if (isExecutableFile(file, isWindows)) return file;
    }
  }
  return undefined;
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
