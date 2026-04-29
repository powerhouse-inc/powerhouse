import { join } from "node:path";
import {
  DEFAULT_REGISTRY_URL,
  POWERHOUSE_CONFIG_FILE,
} from "../clis/constants.js";
import { getConfig } from "../clis/file-system/get-config.js";
import { spawnAsync } from "../clis/file-system/spawn-async.js";

export { DEFAULT_REGISTRY_URL } from "../clis/constants.js";

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
}

export interface NpmPublishResult {
  /** stdout from npm publish. */
  stdout: string;
}

/**
 * Run `npm publish` against the given registry.
 * Uses spawn with args array to avoid shell injection.
 */
export async function npmPublish(
  options: NpmPublishOptions,
): Promise<NpmPublishResult> {
  const { registryUrl, cwd, args = [] } = options;
  const npmArgs = ["publish", "--registry", registryUrl, ...args];
  const stdout = await spawnAsync("npm", npmArgs, { cwd });
  return { stdout };
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
  const { registryUrl, cwd, spec, args = [] } = options;
  const npmArgs = [
    "unpublish",
    spec,
    "--registry",
    registryUrl,
    "--force",
    ...args,
  ];
  const stdout = await spawnAsync("npm", npmArgs, { cwd });
  return { stdout };
}
