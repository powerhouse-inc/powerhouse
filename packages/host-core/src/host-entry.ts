import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * How a host is started as a child of the process that supervises it: the
 * project's own `ph run`, in an environment of its own. Read by `spawnHost`
 * and by the supervisor, which loads nothing of the project.
 */

const BASE_ENV_KEYS = ["PATH", "HOME", "TMPDIR"];
const WIN32_ENV_KEYS = [
  "SystemRoot",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "TEMP",
  "TMP",
  "ComSpec",
  "PATHEXT",
];

/** The child's whole env: without a `baseEnv`, no other `process.env` key
 * reaches it. */
export function childEnv(
  dataDir: string,
  env: Record<string, string> = {},
  baseEnv?: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  if ("PH_USER_DATA_DIR" in env) {
    throw new Error(
      "spawnHost: set the data dir with `dataDir`, not env.PH_USER_DATA_DIR.",
    );
  }
  if (baseEnv) {
    const base: Record<string, string> = {};
    for (const [key, value] of Object.entries(baseEnv)) {
      if (value !== undefined) base[key] = value;
    }
    return { ...base, PH_USER_DATA_DIR: dataDir, ...env };
  }
  const keys =
    process.platform === "win32"
      ? [...BASE_ENV_KEYS, ...WIN32_ENV_KEYS]
      : BASE_ENV_KEYS;
  const base: Record<string, string> = {};
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined) base[key] = value;
  }
  return {
    ...base,
    PH_USER_DATA_DIR: dataDir,
    PH_NO_TELEMETRY: "1",
    PH_NO_DOTENV: "1",
    ...env,
  };
}

/** The version of the package an entry of {@link resolvePhCliEntry} is in. */
export function phCliEntryVersion(entry: string): string | undefined {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(path.dirname(path.dirname(entry)), "package.json"),
        "utf8",
      ),
    ) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

/** Whether a standalone host of that release stops when its stdin ends
 * (6.4 on); an earlier one is asked over its stop channel. An unknown
 * version counts as this one. */
export function stopsOnStdin(version: string | undefined): boolean {
  const match = /^(\d+)\.(\d+)\./.exec(version ?? "");
  if (!match) return true;
  const major = Number(match[1]);
  return major > 6 || (major === 6 && Number(match[2]) >= 4);
}

/** The project's ph-cli, else its ph-run (a packaged app has only that). */
export function resolvePhCliEntry(projectRoot: string): string {
  const require_ = createRequire(
    pathToFileURL(path.join(projectRoot, "package.json")).href,
  );
  let pkgPath: string;
  try {
    pkgPath = require_.resolve("@powerhousedao/ph-cli/package.json");
  } catch (error) {
    try {
      pkgPath = require_.resolve("@powerhousedao/ph-run/package.json");
    } catch {
      throw error;
    }
  }
  return path.join(path.dirname(pkgPath), "dist", "cli.mjs");
}
