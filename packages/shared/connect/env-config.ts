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
// Application Configuration (build metadata only)
// ============================================================================

/**
 * Connect runtime values (anything in `PHConnectRuntimeConfig`) are NOT
 * settable from env vars. They live in `powerhouse.config.json` and are
 * overridden via `ph connect build --<field>` or `ph connect config
 * --<field>`.
 *
 * What stays env-driven below is non-runtime: build metadata, Sentry
 * credentials, analytics processor toggles, etc.
 */
const appConfigSchema = z.object({
  /**
   * Application version number (build metadata stamp)
   * @default "unknown"
   */
  PH_CONNECT_VERSION: z.string().default("unknown"),

  /**
   * CLI version number (build metadata stamp)
   */
  PH_CONNECT_CLI_VERSION: z.string().optional(),
});

// ============================================================================
// Analytics Processor Configuration
// ============================================================================

/**
 * Analytics processor configuration schema. These are non-runtime feature
 * toggles for the analytics subsystem — they don't live in the runtime
 * schema and stay env-driven.
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
// Combined Schemas
// ============================================================================

/**
 * Complete runtime environment schema (all PH_CONNECT_* vars).
 *
 * Only build-metadata / Sentry / analytics-processor toggles live here.
 * Connect runtime config (renown, drives, branding, app, packages.externalEnabled)
 * is sourced exclusively from `powerhouse.config.json` and CLI overrides —
 * never from env.
 */
export const runtimeEnvSchema = appConfigSchema
  .extend(processorsConfigSchema.shape)
  .extend(sentryConfigSchema.shape);

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

  // Apply priority: fileEnv < processEnv
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
 * 2. fileEnv
 * 3. defaults from schema (lowest)
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
 * Loads only runtime environment variables (build metadata + Sentry +
 * analytics-processor toggles — everything in the Connect runtime schema
 * is sourced from powerhouse.config.json, not env).
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
 * Safely sets Connect environment variables with validation.
 * Invalid values will log a warning and be skipped.
 *
 * @param values - Type-safe object with key-value pairs to set
 *
 * @example
 * ```ts
 * setConnectEnv({
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
