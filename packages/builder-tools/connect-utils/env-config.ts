import { z } from "zod/v3";

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
   * Path to powerhouse config file
   * @default "powerhouse.config.json"
   */
  PH_CONFIG_PATH: z.string().optional(),

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
   * Amount of time to wait before a file is considered changed
   * @default 300
   */
  PH_WATCH_TIMEOUT: numberString.default(300),

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
   * Whether app requires hard refresh on updates
   * @default true
   */
  PH_CONNECT_REQUIRES_HARD_REFRESH: booleanString.default(true),

  /**
   * Show warning when app version is outdated
   * @default false
   */
  PH_CONNECT_WARN_OUTDATED_APP: booleanString.default(false),

  /**
   * Enable studio mode features
   * @default false
   */
  PH_CONNECT_STUDIO_MODE: booleanString.default(false),

  /**
   * Base path for the Connect router, defaults to import.meta.env.BASE_URL
   */
  PH_CONNECT_BASE_PATH: z.string().optional(),

  /**
   * Default drives URL to load on startup
   */
  PH_CONNECT_DEFAULT_DRIVES_URL: z.string().optional(),

  /**
   * Strategy for preserving drives
   */
  PH_CONNECT_DRIVES_PRESERVE_STRATEGY: z.string().optional(),

  /**
   * Interval in milliseconds to check for version updates
   * @default 3600000 (1 hour)
   */
  PH_CONNECT_VERSION_CHECK_INTERVAL: numberString.default(60 * 60 * 1000),

  /**
   * CLI version number
   */
  PH_CONNECT_CLI_VERSION: z.string().optional(),

  /**
   * Chunk size for file upload operations
   * @default 50
   */
  PH_CONNECT_FILE_UPLOAD_OPERATIONS_CHUNK_SIZE: numberString.default(50),
});

// ============================================================================
// Feature Flags & UI Configuration
// ============================================================================

/**
 * Feature flags and UI configuration schema
 */
const featureFlagsSchema = z.object({
  /**
   * Hide the "Add Drive" button completely
   * @default false
   */
  PH_CONNECT_DISABLE_ADD_DRIVE: booleanString.default(false),

  /**
   * Show search bar in the UI
   * @default false
   */
  PH_CONNECT_SEARCH_BAR_ENABLED: booleanString.default(false),

  /**
   * Hide document model selection in settings
   * @default true
   */
  PH_CONNECT_HIDE_DOCUMENT_MODEL_SELECTION_SETTINGS:
    booleanString.default(true),

  /**
   * Comma-separated list of enabled editor types
   * Use "*" to enable all editors
   * @example "editor1,editor2" or "*"
   */
  PH_CONNECT_ENABLED_EDITORS: z.string().optional(),

  /**
   * Comma-separated list of disabled editor types
   * @default "powerhouse/document-drive"
   */
  PH_CONNECT_DISABLED_EDITORS: z.string().default("powerhouse/document-drive"),

  /**
   * Google Analytics tracking ID
   */
  PH_CONNECT_GA_TRACKING_ID: z.string().optional(),

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
   * Enable cloud drives section
   * @default true
   */
  PH_CONNECT_CLOUD_DRIVES_ENABLED: booleanString.default(true),

  /**
   * Allow adding cloud drives
   * @default true
   */
  PH_CONNECT_DISABLE_ADD_CLOUD_DRIVES: booleanString.default(false),

  /**
   * Allow deleting cloud drives
   * @default true
   */
  PH_CONNECT_DISABLE_DELETE_CLOUD_DRIVES: booleanString.default(false),

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
const analyticsProcessorsConfigSchema = z.object({
  /**
   * Enable analytics
   * @default true
   */
  PH_CONNECT_ANALYTICS_ENABLED: booleanString.default(true),

  /**
   * Name of the analytics database
   * Defaults to basename + ":analytics"
   */
  PH_CONNECT_ANALYTICS_DATABASE_NAME: z.string().optional(),

  /**
   * Disable analytics database worker
   * @default false
   */
  PH_CONNECT_ANALYTICS_DATABASE_WORKER_DISABLED: booleanString.default(true),

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

/**
 * Relational DB processor configuration schema
 */
const relationalProcessorsConfigSchema = z.object({
  /**
   * Enable relational processors
   * @default true
   */
  PH_CONNECT_RELATIONAL_PROCESSORS_ENABLED: booleanString.default(true),

  /**
   * Enable external relational processors
   * @default true
   */
  PH_CONNECT_EXTERNAL_RELATIONAL_PROCESSORS_ENABLED:
    booleanString.default(true),
});

/**
 * External processors configuration schema
 */
const processorsBaseConfigSchema = z.object({
  /**
   * Enable processors
   * @default true
   */
  PH_CONNECT_PROCESSORS_ENABLED: booleanString.default(true),

  /**
   * Enable external processors
   * @default true
   */
  PH_CONNECT_EXTERNAL_PROCESSORS_ENABLED: booleanString.default(true),
});

const processorsConfigSchema = processorsBaseConfigSchema
  .merge(analyticsProcessorsConfigSchema)
  .merge(relationalProcessorsConfigSchema);

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
  .merge(featureFlagsSchema)
  .merge(drivesConfigSchema)
  .merge(processorsConfigSchema)
  .merge(sentryConfigSchema)
  .merge(renownConfigSchema);

/**
 * Complete environment schema (build + runtime)
 */
export const connectEnvSchema = buildEnvSchema.merge(runtimeEnvSchema);

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
   * Environment variables from options (medium priority)
   */
  optionsEnv?: Partial<ConnectEnv>;

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
  schema: z.ZodObject<z.ZodRawShape>,
): Record<string, unknown> {
  const { processEnv = {}, optionsEnv = {}, fileEnv = {} } = options;
  const merged: Record<string, unknown> = {};

  // Apply priority: fileEnv < optionsEnv < processEnv
  for (const key of keys) {
    const sources = [
      { name: "process.env", value: processEnv[key] },
      { name: "options", value: (optionsEnv as Record<string, unknown>)[key] },
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
 *   PH_CONNECT_STUDIO_MODE: true,
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
