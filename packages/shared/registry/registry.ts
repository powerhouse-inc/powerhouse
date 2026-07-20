import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_REGISTRY_URL,
  POWERHOUSE_CONFIG_FILE,
} from "../clis/constants.js";
import { getConfig } from "../clis/file-system/get-config.js";
import { spawnAsync } from "../clis/file-system/spawn-async.js";

export { DEFAULT_REGISTRY_URL } from "../clis/constants.js";

/**
 * Extract the host portion of a registry URL — what npm uses as the key in
 * `~/.npmrc` for per-registry tokens (e.g. `//registry.vetra.io/`).
 */
export function registryAuthKey(registryUrl: string): string {
  const url = new URL(registryUrl);
  // Always trailing slash; npm's lookup is exact-match against the leading
  // path of the registry URL, with `//` prefix and trailing `/`.
  const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return `//${url.host}${path}:_authToken`;
}

export interface ResolveRegistryUrlOptions {
  /** Explicit registry URL (e.g. from --registry flag). Highest priority. */
  registry?: string;
  /** Project path to read powerhouse.config.json from. */
  projectPath: string;
  /** Environment variables. Defaults to process.env. */
  env?: Record<string, string | undefined>;
}

/**
 * Resolve the registry URL with priority: flag > env > config > default.
 */
export function resolveRegistryUrl(options: ResolveRegistryUrlOptions): string {
  const { registry, projectPath, env = process.env } = options;
  const configPath = join(projectPath, POWERHOUSE_CONFIG_FILE);
  const config = getConfig(configPath);

  return (
    registry ??
    env.PH_REGISTRY_URL ??
    config.packageRegistryUrl ??
    DEFAULT_REGISTRY_URL
  );
}

/**
 * Check if the user is authenticated with the given npm registry.
 * Returns the username on success, throws on failure.
 */
export async function checkNpmAuth(registryUrl: string): Promise<string> {
  return spawnAsync("npm", ["whoami", "--registry", registryUrl]);
}

export interface NpmPublishOptions {
  /** Registry URL to publish to. */
  registryUrl: string;
  /** Working directory (project root). */
  cwd: string;
  /** Additional arguments forwarded to npm publish. */
  args?: string[];
  /** Bearer token for the registry. When set, passed via a registry-scoped
   *  `_authToken` config flag rather than read from the user's `.npmrc`. */
  authToken?: string;
}

export interface NpmPublishResult {
  /** stdout from npm publish. */
  stdout: string;
}

/**
 * Run `npm publish` against the given registry.
 * Uses spawn with args array to avoid shell injection.
 *
 * When `authToken` is provided, the token is passed via a registry-scoped
 * `--//host/:_authToken=<token>` flag (npm's standard form for per-registry
 * tokens) so we never have to write to `~/.npmrc`.
 */
export async function npmPublish(
  options: NpmPublishOptions,
): Promise<NpmPublishResult> {
  const { registryUrl, cwd, args = [], authToken } = options;
  const tokenArg = authToken
    ? [`--${registryAuthKey(registryUrl)}=${authToken}`]
    : [];
  const npmArgs = ["publish", "--registry", registryUrl, ...tokenArg, ...args];
  const stdout = await spawnAsync("npm", npmArgs, { cwd });
  return { stdout };
}

/**
 * Write `_authToken=<token>` for the given registry host into `~/.npmrc`,
 * preserving any other lines. Replaces the existing entry for the same key
 * if present. Returns the absolute path to the npmrc that was written.
 */
export async function writeRegistryAuthToken(
  registryUrl: string,
  token: string,
): Promise<string> {
  const npmrcPath = join(homedir(), ".npmrc");
  const key = registryAuthKey(registryUrl);
  let existing = "";
  try {
    existing = await fs.readFile(npmrcPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const lines = existing.split("\n");
  const filtered = lines.filter((line) => !line.startsWith(`${key}=`));
  // Also drop any trailing empties to avoid stacking blank lines on rewrite.
  while (filtered.length && filtered[filtered.length - 1] === "")
    filtered.pop();
  filtered.push(`${key}=${token}`);
  await fs.writeFile(npmrcPath, `${filtered.join("\n")}\n`, "utf8");
  return npmrcPath;
}

export interface NpmUnpublishOptions {
  /** Registry URL to unpublish from. */
  registryUrl: string;
  /** Working directory (project root). */
  cwd: string;
  /** Package spec: `<name>` (whole package) or `<name>@<version>` (single version). */
  spec: string;
  /** Additional arguments forwarded to npm unpublish. */
  args?: string[];
  /** Bearer token for the registry (same semantics as `NpmPublishOptions.authToken`). */
  authToken?: string;
}

export interface NpmUnpublishResult {
  /** stdout from npm unpublish. */
  stdout: string;
}

/**
 * Run `npm unpublish` against the given registry.
 * Always passes `--force` because npm otherwise refuses to unpublish packages
 * older than 72h (a public-npmjs safeguard that doesn't apply to private registries).
 */
export async function npmUnpublish(
  options: NpmUnpublishOptions,
): Promise<NpmUnpublishResult> {
  const { registryUrl, cwd, spec, args = [], authToken } = options;
  const tokenArg = authToken
    ? [`--${registryAuthKey(registryUrl)}=${authToken}`]
    : [];
  const npmArgs = [
    "unpublish",
    spec,
    "--registry",
    registryUrl,
    "--force",
    ...tokenArg,
    ...args,
  ];
  const stdout = await spawnAsync("npm", npmArgs, { cwd });
  return { stdout };
}
