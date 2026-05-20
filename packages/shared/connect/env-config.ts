import { z } from "zod";

/**
 * Coerces string values to boolean.
 * Accepts: "true", "false", true, false
 */
const booleanString = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((val) => {
    if (typeof val === "boolean") return val;
    return val === "true";
  });

/**
 * Coerces string values to number.
 */
const numberString = z.union([z.number(), z.string()]).transform((val) => {
  if (typeof val === "number") return val;
  return parseInt(val, 10);
});

// ============================================================================
// Build-time Environment Variables
// ============================================================================

/**
 * Build-time configuration schema
 */
const buildEnvSchema = z.object({
  /**
   * Comma-separated list of package names to load
   * @example "package1,package2"
   */
  PH_PACKAGES: z.string().optional(),

  /**
   * Path to local package to load during development
   */
  PH_LOCAL_PACKAGE: z.string().optional(),

  /**
   * Disable loading of local package
   * @default false
   */
  PH_DISABLE_LOCAL_PACKAGE: booleanString.default(false),

  /**
   * Sentry authentication token for uploading source maps
   */
  PH_SENTRY_AUTH_TOKEN: z.string().optional(),

  /**
   * Sentry organization slug
   */
  PH_SENTRY_ORG: z.string().optional(),

  /**
   * Sentry project slug
   */
  PH_SENTRY_PROJECT: z.string().optional(),
});

// ============================================================================
// Application Configuration
// ============================================================================

/**
 * Application configuration schema
 */
const appConfigSchema = z.object({
  /**
   * Application version number
   * @default "unknown"
   */
  PH_CONNECT_VERSION: z.string().default("unknown"),

  /**
   * Log level for the application
   * @default "info"
   */
  PH_CONNECT_LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),

  /**
   * Base path for the Connect router, defaults to import.meta.env.BASE_URL
   */
  PH_CONNECT_BASE_PATH: z.string().optional(),

  /**
   * Default drives URL to load on startup.
   * @deprecated Set `connect.drives.defaultDrives` in powerhouse.config.json
   * instead. This env var is now used only as a first-time seed for the
   * config file (set-if-absent semantics). See CONNECT-CONFIG.md §13.
   */
  PH_CONNECT_DEFAULT_DRIVES_URL: z.string().optional(),
  /**
   * Names of packages to load in connect.
   * @deprecated Set the `packages[]` array in powerhouse.config.json instead.
   * This env var is now used only as a first-time seed for the config file
   * (set-if-absent semantics). See CONNECT-CONFIG.md §13.
   */
  PH_CONNECT_PACKAGES: z.string().optional(),
  /**
   * URL(s) of the packages registry CDN endpoint.
   * Supports comma-separated URLs for multiple registries.
   * @example "http://localhost:8080/-/cdn/"
   * @example "https://registry.powerhouse.io/-/cdn/,http://localhost:8080/-/cdn/"
   */
  PH_CONNECT_PACKAGES_REGISTRY: z.string().optional(),

  /**
   * Strategy for preserving drives
   */
  PH_CONNECT_DRIVES_PRESERVE_STRATEGY: z.string().optional(),

  /**
   * CLI version number
   */
  PH_CONNECT_CLI_VERSION: z.string().optional(),
});

// ============================================================================
// Feature Flags & UI Configuration
// ============================================================================

/**
 * Feature flags and UI configuration schema
 */
const featureFlagsSchema = z.object({
  /**
   * Hide the "Add Drive" button completely.
   * @default false
   * @deprecated Set `connect.drives.allowAddDrive` (inverted) in
   * powerhouse.config.json instead. This env var is now used only as a
   * first-time seed for the config file (set-if-absent semantics).
   * See CONNECT-CONFIG.md §13.
   */
  PH_CONNECT_DISABLE_ADD_DRIVE: booleanString.default(false),

  /**
   * Disable loading of external packages
   * @default false
   */
  PH_CONNECT_EXTERNAL_PACKAGES_DISABLED: booleanString.default(false),
});

// ============================================================================
// Drives Configuration
// ============================================================================

/**
 * Drives configuration schema
 */
const drivesConfigSchema = z.object({
  /**
   * Enable public drives section
   * @default true
   */
  PH_CONNECT_PUBLIC_DRIVES_ENABLED: booleanString.default(true),

  /**
   * Allow adding public drives
   * @default true
   */
  PH_CONNECT_DISABLE_ADD_PUBLIC_DRIVES: booleanString.default(false),

  /**
   * Allow deleting public drives
   * @default true
   */
  PH_CONNECT_DISABLE_DELETE_PUBLIC_DRIVES: booleanString.default(false),

  /**
   * Enable local drives section
   * @default true
   */
  PH_CONNECT_LOCAL_DRIVES_ENABLED: booleanString.default(true),

  /**
   * Allow adding local drives
   * @default true
   */
  PH_CONNECT_DISABLE_ADD_LOCAL_DRIVES: booleanString.default(false),

  /**
   * Allow deleting local drives
   * @default true
   */
  PH_CONNECT_DISABLE_DELETE_LOCAL_DRIVES: booleanString.default(false),
});

// ============================================================================
// Analytics Processor Configuration
// ============================================================================

/**
 * Analytics processor configuration schema
 */
/**
 * Analytics processor configuration schema. The toggles for the analytics
 * subsystem itself (PH_CONNECT_ANALYTICS_ENABLED, _DATABASE_NAME,
 * _DATABASE_WORKER_DISABLED) and the processor on/off flags
 * (PH_CONNECT_PROCESSORS_ENABLED, _EXTERNAL_PROCESSORS_ENABLED,
 * _RELATIONAL_PROCESSORS_ENABLED, _EXTERNAL_RELATIONAL_PROCESSORS_ENABLED)
 * were removed in §2.3 of the audit — they had no gating consumer in Connect.
 * What remains is the small set of analytics-specific flags that still
 * influence the processor wiring downstream.
 */
const processorsConfigSchema = z.object({
  /**
   * Enable diff analytics tracking
   * @default false
   */
  PH_CONNECT_DIFF_ANALYTICS_ENABLED: booleanString.default(false),

  /**
   * Enable drive analytics tracking
   * @default true
   */
  PH_CONNECT_DRIVE_ANALYTICS_ENABLED: booleanString.default(true),

  /**
   * Enable external analytics processors
   * @default true
   */
  PH_CONNECT_EXTERNAL_ANALYTICS_PROCESSORS_ENABLED: booleanString.default(true),
});

// ============================================================================
// Sentry Configuration
// ============================================================================

/**
 * Sentry error tracking configuration schema
 */
const sentryConfigSchema = z.object({
  /**
   * Sentry release identifier
   * Defaults to app version
   */
  PH_CONNECT_SENTRY_RELEASE: z.string().optional(),

  /**
   * Sentry DSN for error reporting
   */
  PH_CONNECT_SENTRY_DSN: z.string().optional(),

  /**
   * Sentry environment name
   * @default "prod"
   */
  PH_CONNECT_SENTRY_ENV: z.string().default("dev"),

  /**
   * Enable Sentry performance tracing
   * @default false
   */
  PH_CONNECT_SENTRY_TRACING_ENABLED: booleanString.default(false),
});

// ============================================================================
// Renown Configuration
// ============================================================================

/**
 * Renown authentication configuration schema
 */
const renownConfigSchema = z.object({
  /**
   * Renown authentication service URL
   * @default "https://www.renown.id"
   */
  PH_CONNECT_RENOWN_URL: z.string().default("https://www.renown.id"),

  /**
   * Renown network ID
   * @default "eip155"
   */
  PH_CONNECT_RENOWN_NETWORK_ID: z.string().default("eip155"),

  /**
   * Renown chain ID
   * @default 1
   */
  PH_CONNECT_RENOWN_CHAIN_ID: numberString.default(1),
});

// ============================================================================
// Combined Schemas
// ============================================================================

/**
 * Complete runtime environment schema (all PH_CONNECT_* vars)
 */
export const runtimeEnvSchema = appConfigSchema
  .extend(featureFlagsSchema.shape)
  .extend(drivesConfigSchema.shape)
  .extend(processorsConfigSchema.shape)
  .extend(sentryConfigSchema.shape)
  .extend(renownConfigSchema.shape);

/**
 * Complete environment schema (build + runtime)
 */
export const connectEnvSchema = buildEnvSchema.extend(runtimeEnvSchema.shape);

/**
 * Inferred TypeScript types from schemas
 */
export type ConnectBuildEnv = z.infer<typeof buildEnvSchema>;
export type ConnectRuntimeEnv = z.infer<typeof runtimeEnvSchema>;
export type ConnectEnv = z.infer<typeof connectEnvSchema>;

// ============================================================================
// Environment Loading Functions
// ============================================================================

/**
 * Options for loading environment variables
 */
export interface LoadEnvOptions {
  /**
   * Environment variables from process.env (highest priority)
   */
  processEnv?: Record<string, string | undefined>;
  /**
   * Environment variables from .env file (lowest priority)
   */
  fileEnv?: Record<string, string | undefined>;
}

/**
 * Internal helper to merge environment sources with priority.
 * Validates each value and falls back to next priority if invalid.
 */
function mergeEnvSources(
  options: LoadEnvOptions,
  keys: Set<string>,
  schema: z.ZodObject<Record<string, z.ZodTypeAny>>,
): Record<string, unknown> {
  const { processEnv = {}, fileEnv = {} } = options;
  const merged: Record<string, unknown> = {};

  // Apply priority: fileEnv < optionsEnv < processEnv
  for (const key of keys) {
    const sources = [
      { name: "process.env", value: processEnv[key] },
      { name: "fileEnv", value: fileEnv[key] },
    ];

    // Try each source in priority order
    for (const source of sources) {
      const value = source.value;
      if (value === undefined || value === "") continue;

      // Try to validate just this field
      try {
        const fieldSchema = schema.shape[key];
        if (fieldSchema) {
          fieldSchema.parse(value);
          merged[key] = value;
          break; // Successfully validated, use this value
        }
        // No schema for this key, accept it
        console.warn(`Unknown environment variable: '${key}'`);
        merged[key] = value;
        break;
      } catch {
        // Validation failed, log warning and try next source
        const valueStr =
          value === null
            ? "null"
            : typeof value === "object"
              ? JSON.stringify(value)
              : (value as string);
        console.warn(
          `Invalid value for ${key} from ${source.name}: ${valueStr}. Trying next source.`,
        );
      }
    }
  }

  return merged;
}

/**
 * Loads and validates environment variables with priority:
 * 1. process.env (highest)
 * 2. options
 * 3. fileEnv
 * 4. defaults from schema (lowest)
 *
 * @param options - Environment sources in priority order
 * @returns Validated and typed environment configuration
 */
export function loadConnectEnv(options: LoadEnvOptions = {}): ConnectEnv {
  const allKeys = new Set([
    ...Object.keys(buildEnvSchema.shape),
    ...Object.keys(runtimeEnvSchema.shape),
  ]);

  const merged = mergeEnvSources(options, allKeys, connectEnvSchema);
  return connectEnvSchema.parse(merged);
}

/**
 * Loads only runtime environment variables
 *
 * @param options - Environment sources in priority order
 * @returns Validated runtime environment configuration
 */
export function loadRuntimeEnv(
  options: LoadEnvOptions = {},
): ConnectRuntimeEnv {
  const allKeys = new Set(Object.keys(runtimeEnvSchema.shape));
  const merged = mergeEnvSources(options, allKeys, runtimeEnvSchema);
  return runtimeEnvSchema.parse(merged);
}

/**
 * Loads runtime environment variables and returns both the merged result
 * (with schema defaults filled in) and the "explicit" subset containing
 * only keys that were actually set by the user (non-empty source value).
 *
 * This enables proper override precedence: file config < env explicit < CLI.
 * Without this, schema defaults would always win over file config values.
 */
export function loadRuntimeEnvWithExplicit(options: LoadEnvOptions = {}): {
  merged: ConnectRuntimeEnv;
  explicit: Partial<ConnectRuntimeEnv>;
} {
  const { processEnv = {}, fileEnv = {} } = options;
  const allKeys = new Set(Object.keys(runtimeEnvSchema.shape));

  const explicit: Record<string, unknown> = {};
  for (const key of allKeys) {
    const sources = [
      { name: "process.env", value: processEnv[key] },
      { name: "fileEnv", value: fileEnv[key] },
    ];

    for (const source of sources) {
      const value = source.value;
      if (value === undefined || value === "") continue;

      try {
        const fieldSchema = runtimeEnvSchema.shape[
          key as keyof typeof runtimeEnvSchema.shape
        ] as z.ZodType<unknown> | undefined;
        if (fieldSchema) {
          explicit[key] = fieldSchema.parse(value);
        }
        break;
      } catch {
        continue;
      }
    }
  }

  const merged = mergeEnvSources(options, allKeys, runtimeEnvSchema);
  return {
    merged: runtimeEnvSchema.parse(merged),
    explicit: explicit as Partial<ConnectRuntimeEnv>,
  };
}

/**
 * Loads only build-time environment variables
 *
 * @param options - Environment sources in priority order
 * @returns Validated build environment configuration
 */
export function loadBuildEnv(options: LoadEnvOptions = {}): ConnectBuildEnv {
  const allKeys = new Set(Object.keys(buildEnvSchema.shape));
  const merged = mergeEnvSources(options, allKeys, buildEnvSchema);
  return buildEnvSchema.parse(merged);
}

/**
 * Safely sets Connect environment variables with validation.
 * Invalid values will log a warning and be skipped.
 *
 * @param values - Type-safe object with key-value pairs to set
 *
 * @example
 * ```ts
 * setConnectEnv({
 *   PH_CONNECT_LOG_LEVEL: "debug",
 *   PH_CONNECT_VERSION: "1.2.3",
 *   PH_CONNECT_SENTRY_DSN: "https://…",
 * });
 * ```
 */
export function setConnectEnv(values: Partial<ConnectEnv>): void {
  for (const [key, value] of Object.entries(values)) {
    // Check if key exists in schema
    const fieldSchema =
      connectEnvSchema.shape[key as keyof typeof connectEnvSchema.shape];

    if (!fieldSchema) {
      console.warn(
        `Unknown environment variable: ${key}. Variable not set. Valid keys: ${Object.keys(connectEnvSchema.shape).join(", ")}`,
      );
      continue;
    }

    try {
      // Validate the value
      fieldSchema.parse(value);

      // Set the value (convert to string for process.env compatibility)
      process.env[key] = String(value);
    } catch (error) {
      console.warn(
        `Invalid value for ${key}: ${String(value)}. Validation failed.`,
        error,
      );
    }
  }
}

/**
 * Normalizes a base path to ensure it:
 * - Starts with a forward slash (/)
 * - Ends with a forward slash (/)
 * - Has no relative path prefix (.)
 *
 * @param basePath - The base path to normalize
 * @returns The normalized base path
 *
 * @example
 * normalizeBasePath('/app') // '/app/'
 * normalizeBasePath('./app/') // '/app/'
 * normalizeBasePath('app') // '/app/'
 * normalizeBasePath('/') // '/'
 * normalizeBasePath('') // '/'
 */
export function normalizeBasePath(basePath: string): string {
  if (!basePath) {
    return "/";
  }

  let normalized = basePath;

  // Remove relative path prefix
  if (normalized.startsWith(".")) {
    normalized = normalized.slice(1);
  }

  // Ensure it starts with a forward slash
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  // Ensure it ends with a forward slash
  if (!normalized.endsWith("/")) {
    normalized = `${normalized}/`;
  }

  return normalized;
}
