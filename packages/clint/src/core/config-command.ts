import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { dirname, basename, join } from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getSchemaFields, type FieldInfo } from "./schema.js";
import {
  configKeyToEnvVar,
  toUpperSnake,
  localConfigPath,
  userConfigPath,
  resolveConfig,
} from "./config.js";
import type { Command, CommandContext } from "./types.js";

/**
 * Load a JSON config file, returning empty object if missing or invalid.
 */
function loadJsonFile(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Restrictive permissions for config files holding secrets. */
const SENSITIVE_FILE_MODE = 0o600;

// Atomic JSON write: same-dir temp file + rename. `mode` applies to the fresh
// temp file, so it takes effect even when the destination already exists.
function writeJsonFile(
  path: string,
  data: Record<string, unknown>,
  mode?: number,
): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const tmp = join(
    dir,
    `.${basename(path)}.tmp-${randomBytes(6).toString("hex")}`,
  );
  const contents = JSON.stringify(data, null, 2) + "\n";
  try {
    writeFileSync(
      tmp,
      contents,
      mode !== undefined ? { encoding: "utf-8", mode } : "utf-8",
    );
    try {
      renameSync(tmp, path);
    } catch (err) {
      // Windows rename won't clobber an existing destination; replace it.
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "EPERM") throw err;
      unlinkSync(path);
      renameSync(tmp, path);
    }
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {}
    throw err;
  }
}

/** 0600 when the object holds any sensitive key, else undefined (default perms). */
function fileModeFor(
  data: Record<string, unknown>,
  sensitiveKeys?: ReadonlySet<string>,
): number | undefined {
  if (!sensitiveKeys) return undefined;
  for (const key of Object.keys(data)) {
    if (sensitiveKeys.has(key)) return SENSITIVE_FILE_MODE;
  }
  return undefined;
}

/**
 * Coerce a string value to the appropriate type based on schema field info.
 */
function coerceValue(value: string, field: FieldInfo): unknown {
  switch (field.baseType) {
    case "number":
      return Number(value);
    case "boolean":
      return value === "true" || value === "1" || value === "yes";
    default:
      return value;
  }
}

/**
 * Resolve where a config value is actually coming from in the 6-layer chain.
 */
function resolveSource(
  key: string,
  cliName: string,
  workdir: string,
  configFile?: string,
): string {
  // Check layers from highest to lowest priority
  if (configFile) {
    const data = loadJsonFile(configFile);
    if (key in data) return "--config file";
  }

  const envName = configKeyToEnvVar(cliName, key);
  if (process.env[envName] !== undefined) return `env ${envName}`;

  const localPath = localConfigPath(workdir, cliName);
  const localData = loadJsonFile(localPath);
  if (key in localData) return "local";

  const userPath = userConfigPath(cliName);
  const userData = loadJsonFile(userPath);
  if (key in userData) return "user";

  return "default";
}

export interface ConfigCommandOptions {
  cliName: string;
  configSchema: z.ZodType;
  /** Keys of config fields that are sensitive (from secretsSchema). */
  sensitiveKeys?: ReadonlySet<string>;
  /** Implementation defaults (layer 5). */
  implementationDefaults?: Record<string, unknown>;
  /** Config file from --config flag (already resolved to absolute). */
  configFile?: string;
}

/**
 * All scope values accepted by the config command.
 * Write mode only accepts 'local' and 'user'.
 */
const ALL_SCOPES = ["args", "env", "local", "user", "sys"] as const;
type ConfigScope = (typeof ALL_SCOPES)[number];
const WRITABLE_SCOPES = new Set<ConfigScope>(["local", "user"]);

/**
 * Create the built-in `config` command for a CLI.
 */
export function createConfigCommand(opts: ConfigCommandOptions): Command {
  const { cliName, configSchema, sensitiveKeys, implementationDefaults } = opts;
  const fields = getSchemaFields(configSchema, sensitiveKeys);
  const fieldKeys = fields.map((f) => f.key);
  // Build a map for O(1) lookup — Zod enum validation guarantees the key exists
  const fieldMap = new Map(fields.map((f) => [f.key, f]));

  // Build env-var → field-key reverse lookup for accepting UPPER_SNAKE names
  const envToField = new Map<string, string>();
  for (const f of fields) {
    envToField.set(configKeyToEnvVar(cliName, f.key), f.key);
  }

  const inputSchema = z.object({
    name: z
      .string()
      .optional()
      .describe("Setting name (camelCase) or env variable (UPPER_SNAKE)"),
    write: z.string().optional().describe("Value to write"),
    remove: z
      .boolean()
      .optional()
      .describe("Remove the setting from the scope"),
    list: z.boolean().optional().describe("List all settings"),
    scope: z
      .enum(ALL_SCOPES)
      .optional()
      .describe("Scope to read from or write to"),
    revealSecrets: z
      .boolean()
      .optional()
      .describe("Show sensitive values instead of censoring them"),
  });

  return {
    id: "config",
    description: "View or modify configuration settings",
    inputSchema,
    execute: async (input, context: CommandContext) => {
      const {
        name: rawName,
        write: newValue,
        remove,
        list,
        scope,
        revealSecrets,
      } = input as {
        name?: string;
        write?: string;
        remove?: boolean;
        list?: boolean;
        scope?: ConfigScope;
        revealSecrets?: boolean;
      };
      const reveal = !!revealSecrets;

      const workdir = context.workdir;

      // ── Validate flag combinations ──
      const modes = [newValue !== undefined, !!remove, !!list].filter(
        Boolean,
      ).length;
      if (modes > 1) {
        throw new Error(
          "Options --write, --remove, and --list are mutually exclusive.",
        );
      }

      // ── List mode ──
      if (list) {
        if (rawName) {
          throw new Error("--list does not accept --name.");
        }
        return listSettings(
          fields,
          cliName,
          workdir,
          scope,
          configSchema,
          opts.configFile,
          implementationDefaults,
          reveal,
        );
      }

      // --name is required for read, write, and remove
      if (!rawName) {
        throw new Error(
          "--name is required (use --list to show all settings).",
        );
      }

      // Resolve name: accept camelCase field names or UPPER_SNAKE env var names
      let settingName = rawName;
      if (!fieldMap.has(settingName)) {
        const upper = settingName.toUpperCase();
        const fromEnv = envToField.get(settingName) ?? envToField.get(upper);
        if (fromEnv) {
          settingName = fromEnv;
        } else {
          const validNames = [...fieldMap.keys(), ...envToField.keys()];
          throw new Error(
            `Unknown setting "${rawName}". Valid names:\n${validNames.map((n) => `  ${n}`).join("\n")}`,
          );
        }
      }

      const field = fieldMap.get(settingName)!;

      // ── Remove mode ──
      if (remove) {
        const removeScope = scope ?? "local";
        if (!WRITABLE_SCOPES.has(removeScope)) {
          throw new Error(
            `Cannot remove from scope "${removeScope}". Only local and user are writable.`,
          );
        }
        const filePath =
          removeScope === "user"
            ? userConfigPath(cliName)
            : localConfigPath(workdir, cliName);

        const existing = loadJsonFile(filePath);
        if (!(settingName in existing)) {
          return { text: `${settingName} is not set in ${removeScope} config` };
        }
        delete existing[settingName];
        writeJsonFile(filePath, existing, fileModeFor(existing, sensitiveKeys));
        return { text: `Removed ${settingName} from ${removeScope} config` };
      }

      // ── Write mode ──
      if (newValue !== undefined) {
        const writeScope = scope ?? "local";
        if (!WRITABLE_SCOPES.has(writeScope)) {
          throw new Error(
            `Cannot write to scope "${writeScope}". Only local and user are writable.`,
          );
        }
        const filePath =
          writeScope === "user"
            ? userConfigPath(cliName)
            : localConfigPath(workdir, cliName);

        // Validate the value against the schema
        const coerced = coerceValue(newValue, field);
        try {
          const testObj: Record<string, unknown> = {};
          testObj[settingName] = coerced;
          configSchema.parse(testObj);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Invalid value for ${settingName}: ${msg}`);
        }

        // Read existing file, merge, write back
        const existing = loadJsonFile(filePath);
        existing[settingName] = coerced;
        writeJsonFile(filePath, existing, fileModeFor(existing, sensitiveKeys));

        return {
          text: `Set ${settingName} = ${JSON.stringify(coerced)} in ${writeScope} config`,
        };
      }

      // ── Read mode ──

      // If --scope is specified, read from that specific layer
      if (scope) {
        return readFromScope(
          settingName,
          scope,
          cliName,
          workdir,
          field,
          configSchema,
          implementationDefaults,
          reveal,
        );
      }

      // No scope — show resolved value with source
      const resolved = resolveConfig({
        configSchema,
        cliName,
        workdir,
        configFile: opts.configFile,
        implementationDefaults,
      });

      const value = resolved[settingName];
      const source = resolveSource(
        settingName,
        cliName,
        workdir,
        opts.configFile,
      );
      const displayValue =
        !reveal && field.sensitive && value !== undefined && value !== null
          ? '"***"'
          : JSON.stringify(value);

      return { text: `${settingName} = ${displayValue}  (source: ${source})` };
    },
  };
}

/**
 * Censor a value if the field is sensitive and reveal is not enabled.
 */
function censorValue(
  value: unknown,
  field: FieldInfo,
  reveal: boolean,
): string {
  if (!reveal && field.sensitive && value !== undefined && value !== null)
    return '"***"';
  return JSON.stringify(value);
}

/**
 * List all settings as a formatted table.
 */
function listSettings(
  fields: FieldInfo[],
  cliName: string,
  workdir: string,
  scope: ConfigScope | undefined,
  configSchema: z.ZodType,
  configFile?: string,
  implementationDefaults?: Record<string, unknown>,
  reveal = false,
): { text: string } {
  const lines: string[] = [];

  // Calculate column widths
  const maxKeyLen = Math.max(...fields.map((f) => f.key.length));

  for (const field of fields) {
    const paddedKey = field.key.padEnd(maxKeyLen);

    if (scope) {
      // Show value from the specific scope
      const result = readFromScope(
        field.key,
        scope,
        cliName,
        workdir,
        field,
        configSchema,
        implementationDefaults,
        reveal,
      );
      // Extract just the value portion or "not set"
      const match = result.text.match(/= (.+?) {2}\(/);
      if (match) {
        lines.push(`${paddedKey}  ${match[1]}`);
      } else {
        lines.push(`${paddedKey}  (not set)`);
      }
    } else {
      // Show resolved value with source
      try {
        const resolved = resolveConfig({
          configSchema,
          cliName,
          workdir,
          configFile,
          implementationDefaults,
        });
        const value = resolved[field.key];
        const source = resolveSource(field.key, cliName, workdir, configFile);
        lines.push(
          `${paddedKey}  ${censorValue(value, field, reveal)}  (${source})`,
        );
      } catch {
        lines.push(`${paddedKey}  <error>`);
      }
    }
  }

  return { text: lines.join("\n") };
}

/**
 * Read a setting from a specific scope layer.
 */
function readFromScope(
  key: string,
  scope: ConfigScope,
  cliName: string,
  workdir: string,
  field: FieldInfo,
  configSchema: z.ZodType,
  implementationDefaults?: Record<string, unknown>,
  reveal = false,
): { text: string } {
  switch (scope) {
    case "args": {
      // --config file layer — we can't access the config file path here,
      // so report that this scope requires --config to be set
      return {
        text: `${key}: the args scope reflects the --config file, which is not accessible from this context`,
      };
    }
    case "env": {
      const envName = configKeyToEnvVar(cliName, key);
      const value = process.env[envName];
      if (value === undefined) {
        return { text: `${key} is not set in environment (${envName})` };
      }
      return {
        text: `${key} = ${censorValue(value, field, reveal)}  (env: ${envName})`,
      };
    }
    case "local": {
      const filePath = localConfigPath(workdir, cliName);
      const data = loadJsonFile(filePath);
      const value = data[key];
      if (value === undefined) {
        return { text: `${key} is not set in local config` };
      }
      return { text: `${key} = ${censorValue(value, field, reveal)}  (local)` };
    }
    case "user": {
      const filePath = userConfigPath(cliName);
      const data = loadJsonFile(filePath);
      const value = data[key];
      if (value === undefined) {
        return { text: `${key} is not set in user config` };
      }
      return { text: `${key} = ${censorValue(value, field, reveal)}  (user)` };
    }
    case "sys": {
      // System defaults: implementation defaults merged with schema defaults
      const defaults = implementationDefaults ?? {};
      if (key in defaults) {
        return {
          text: `${key} = ${censorValue(defaults[key], field, reveal)}  (system default)`,
        };
      }
      if (field.hasDefault) {
        return {
          text: `${key} = ${censorValue(field.defaultValue, field, reveal)}  (system default)`,
        };
      }
      return { text: `${key} has no system default` };
    }
  }
}

/**
 * Generate a detailed help page for the config command.
 */
export function generateConfigCommandHelp(
  cliName: string,
  configSchema: z.ZodType,
  workdir: string,
  sensitiveKeys?: ReadonlySet<string>,
): string {
  const fields = getSchemaFields(configSchema, sensitiveKeys);
  const lines: string[] = [];

  const cliPrefix = toUpperSnake(cliName);

  // ── Header ──
  lines.push(`${cliName} config — View and modify configuration`);
  lines.push("");
  lines.push(`Usage: ${cliName} config [options]`);
  lines.push("");
  lines.push("Options:");
  lines.push("  -n, --name <setting>   Setting name");
  lines.push("  -w, --write <value>    Write a new value");
  lines.push("  -r, --remove           Remove a setting from the scope");
  lines.push("  -l, --list             List all settings");
  lines.push("  -s, --scope <scope>    Scope to read from or write to");
  lines.push("                         Read:  args | env | local | user | sys");
  lines.push(
    "                         Write/Remove: local | user (default: local)",
  );
  lines.push("");
  lines.push("Examples:");
  lines.push(
    `  ${cliName} config --list                          Show all settings`,
  );
  lines.push(
    `  ${cliName} config --list --scope env              Show environment overrides`,
  );
  lines.push(
    `  ${cliName} config --name watchDir                 Show resolved value`,
  );
  lines.push(
    `  ${cliName} config --name watchDir --scope local   Show local config value`,
  );
  lines.push(
    `  ${cliName} config --name watchDir --write ./lib   Write to local config`,
  );
  lines.push(`  ${cliName} config --name watchDir --write ./lib --scope user`);
  lines.push(
    `  ${"".padEnd(cliName.length)}                                       Write to user config`,
  );
  lines.push(
    `  ${cliName} config --name watchDir --remove        Remove from local config`,
  );
  lines.push("");

  // ── Section 1: Settings ──
  lines.push("Settings:");
  lines.push("");

  for (const field of fields) {
    const envVar = configKeyToEnvVar(cliName, field.key);

    const typeParts: string[] = [field.baseType];
    if (field.isOptional) typeParts.push("optional");
    if (!field.isOptional && !field.hasDefault) typeParts.push("required");

    const nameLine = field.description
      ? `  ${field.key} — ${field.description}`
      : `  ${field.key}`;
    lines.push(nameLine);
    lines.push("");
    lines.push(`    Type: ${typeParts.join(", ")}`);
    lines.push(`    Env:  ${envVar}`);

    // Show current resolved value and source
    try {
      const resolved = resolveConfig({
        configSchema,
        cliName,
        workdir,
      });
      const value = resolved[field.key];
      const source = resolveSource(field.key, cliName, workdir);
      if (field.hasDefault || field.isOptional) {
        lines.push(
          `    Default: ${censorValue(field.hasDefault ? field.defaultValue : undefined, field, false)}`,
        );
      }
      lines.push(`    Value: ${censorValue(value, field, false)}  (${source})`);
    } catch {
      lines.push("    Value: <error resolving>");
    }

    lines.push("");
  }

  // ── Section 2: Workdir ──
  lines.push("Workdir:");
  lines.push("");
  lines.push(
    "  The working directory (--workdir) is resolved before configuration",
  );
  lines.push(
    "  and determines where local config files are found. It is NOT a config",
  );
  lines.push("  parameter — it is a prerequisite for config resolution.");
  lines.push("");
  lines.push("  Resolution order:");
  lines.push("    1. process.cwd()           Fallback (always available)");
  lines.push("    2. --workdir <path>         User override via CLI flag");
  lines.push("    3. Implementation override  Set by the application code");
  lines.push("");
  lines.push(
    "  Higher numbers take precedence. If the application sets a workdir",
  );
  lines.push("  override, the --workdir flag is hidden from --help.");
  lines.push("");
  lines.push(`  Current: ${workdir}`);
  lines.push("");

  // ── Section 3: Location and resolution rules ──
  lines.push("Location and Resolution:");
  lines.push("");
  lines.push(
    "  Configuration is resolved through 5 layers (highest priority first):",
  );
  lines.push("");
  lines.push("  1. --config <file>    Config file flag (path relative to cwd)");
  lines.push(`  2. Environment vars   ${cliPrefix}_{FIELD_NAME} format`);
  lines.push(`  3. Local config       ${localConfigPath(workdir, cliName)}`);
  lines.push(`  4. User config        ${userConfigPath(cliName)}`);
  lines.push("  5. System defaults    Built-in defaults for this application");
  lines.push("");
  lines.push(
    "  The --write and --remove flags target layer 3 (local) by default,",
  );
  lines.push(
    "  or layer 4 (user) with --scope user. Layers 1, 2, and 5 are read-only.",
  );
  lines.push("");

  return lines.join("\n");
}
