import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";
import { getSchemaFields } from "./schema.js";
import type { ConfigEnvVar } from "./types.js";

/**
 * Convert a camelCase string to UPPER_SNAKE_CASE.
 */
export function toUpperSnake(str: string): string {
  return str
    .replace(/-/g, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toUpperCase();
}

/**
 * Derive the environment variable name for a config field.
 * E.g., configKeyToEnvVar('tasks', 'defaultPriority') → 'TASKS_DEFAULT_PRIORITY'
 */
export function configKeyToEnvVar(cliName: string, field: string): string {
  return `${toUpperSnake(cliName)}_${toUpperSnake(field)}`;
}

/**
 * List all config fields and their corresponding env var names.
 */
export function getConfigEnvVars(
  cliName: string,
  configSchema: z.ZodType,
): ConfigEnvVar[] {
  const fields = getSchemaFields(configSchema);
  return fields.map((f) => ({
    name: configKeyToEnvVar(cliName, f.key),
    field: f.key,
    description: f.description ?? "",
  }));
}

/**
 * Load a JSON config/settings file.
 * Returns empty object if the file doesn't exist or is invalid.
 */
function loadJsonFile(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Pick values from an env-like Record, mapping env var names back to config field names.
 */
function pickEnvValues(
  env: Record<string, string | undefined>,
  cliName: string,
  configSchema: z.ZodType,
): Record<string, string> {
  const fields = getSchemaFields(configSchema);
  const result: Record<string, string> = {};
  for (const field of fields) {
    const envName = configKeyToEnvVar(cliName, field.key);
    const value = env[envName];
    if (value !== undefined) {
      result[field.key] = value;
    }
  }
  return result;
}

/**
 * Return the path to the local config file for a CLI.
 * Located at {workdir}/.ph/{cli-name}.config.local.json.
 */
export function localConfigPath(workdir: string, cliName: string): string {
  return join(workdir, ".ph", `${cliName}.config.local.json`);
}

/**
 * Return the path to the user-wide config file for a CLI.
 * Located at ~/.ph/{cli-name}.config.user.json.
 */
export function userConfigPath(cliName: string): string {
  return join(homedir(), ".ph", `${cliName}.config.user.json`);
}

/**
 * Return the path to a user-scope store folder for a CLI.
 * Located at ~/.ph/{cli-name}/{subpath...}.
 * When called with no subpath, returns the store root ~/.ph/{cli-name}/.
 */
export function userStoreFolder(cliName: string, ...subpath: string[]): string {
  return join(homedir(), ".ph", cliName, ...subpath);
}

/**
 * Options for resolveConfig.
 */
export interface ResolveConfigOptions {
  configSchema: z.ZodType;
  cliName: string;
  /** Resolved workspace directory (absolute path). */
  workdir: string;
  /** Path to a config file from --config flag (relative to cwd). */
  configFile?: string;
  /** Current working directory for resolving --config path. */
  cwd?: string;
  /** Implementation-level defaults (layer 5). */
  implementationDefaults?: Record<string, unknown>;
}

/**
 * Resolve config through 6 layers (highest priority first):
 *
 * 1. Config file (--config flag, path relative to cwd)
 * 2. Environment variables ({CLINAME}_{FIELD_NAME})
 * 3. Local config ({workdir}/.ph/{cli-name}.config.local.json)
 * 4. User config (~/.ph/{cli-name}.config.user.json)
 * 5. Implementation defaults (passed from project code)
 * 6. Hardcoded defaults (from Zod schema .default() calls)
 *
 * Returns the validated, merged config object.
 */
export function resolveConfig(
  opts: ResolveConfigOptions,
): Record<string, unknown> {
  const {
    configSchema,
    cliName,
    workdir,
    configFile,
    cwd,
    implementationDefaults,
  } = opts;

  // Layer 6: hardcoded defaults (handled by Zod parse at the end)

  // Layer 5: implementation defaults
  const implDefaults = implementationDefaults ?? {};

  // Layer 4: user config
  const userPath = userConfigPath(cliName);
  const userConfig = loadJsonFile(userPath);

  // Layer 3: local config
  const localPath = localConfigPath(workdir, cliName);
  const localConfig = loadJsonFile(localPath);

  // Layer 2: environment variables
  const envValues = pickEnvValues(
    process.env as Record<string, string | undefined>,
    cliName,
    configSchema,
  );

  // Layer 1: config file (--config flag)
  let configFileValues: Record<string, unknown> = {};
  if (configFile) {
    const baseCwd = cwd ?? process.cwd();
    const absPath = resolve(baseCwd, configFile);
    configFileValues = loadJsonFile(absPath);
  }

  // Merge (lower priority first, higher priority overwrites)
  const merged = {
    ...implDefaults,
    ...userConfig,
    ...localConfig,
    ...envValues,
    ...configFileValues,
  };

  // Validate through Zod (applies defaults for missing fields)
  return configSchema.parse(merged) as Record<string, unknown>;
}

/**
 * Identify config fields that are mandatory (no default, not optional)
 * and have no value in the merged config.
 */
export function getMissingRequiredFields(
  configSchema: z.ZodType,
  resolvedConfig: Record<string, unknown>,
): Array<{ key: string; description: string }> {
  const fields = getSchemaFields(configSchema);
  const missing: Array<{ key: string; description: string }> = [];
  for (const field of fields) {
    if (
      !field.isOptional &&
      !field.hasDefault &&
      resolvedConfig[field.key] === undefined
    ) {
      missing.push({ key: field.key, description: field.description ?? "" });
    }
  }
  return missing;
}
