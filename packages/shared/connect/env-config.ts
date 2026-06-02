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
// OpenPanel Configuration
// ============================================================================

/**
 * OpenPanel analytics configuration schema
 */
const openPanelConfigSchema = z.object({
  /**
   * OpenPanel client ID. When unset, the OpenPanel subsystem is a no-op.
   */
  PH_CONNECT_OPENPANEL_CLIENT_ID: z.string().optional(),

  /**
   * OpenPanel API URL override. Defaults to the OpenPanel cloud when unset.
   */
  PH_CONNECT_OPENPANEL_API_URL: z.string().optional(),

  /**
   * Track UI events via the useOpenPanel() hook
   * @default true
   */
  PH_CONNECT_OPENPANEL_TRACK_UI_EVENTS: booleanString.default(true),

  /**
   * Track document operations via the OpenPanel processor
   * @default true
   */
  PH_CONNECT_OPENPANEL_TRACK_OPERATIONS: booleanString.default(true),
});

// ============================================================================
// Combined Schemas
// ============================================================================

/**
 * Complete runtime environment schema (all PH_CONNECT_* vars). Only
 * build-metadata + analytics-processor toggles live here; all Connect
 * runtime config lives in `powerhouse.config.json`.
 */
export const runtimeEnvSchema = appConfigSchema
  .extend(processorsConfigSchema.shape)
  .extend(openPanelConfigSchema.shape);

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

/**
 * Base storage namespace for a Connect instance served at the root of an
 * origin. Kept as a literal so root deployments resolve to a byte-identical
 * value with no migration.
 */
export const ROOT_STORAGE_NAMESPACE = "reactor";

/**
 * Derives the origin-scoped storage namespace from a Connect base path.
 *
 * Connect instances served under different path prefixes of the same origin
 * (e.g. behind a reverse proxy) otherwise share all origin-scoped browser
 * storage (PGlite data dirs, IndexedDB). This produces a deterministic,
 * collision-free namespace per distinct prefix that is valid as an
 * IndexedDB database name.
 *
 * - root base path ("/" or unset) -> "reactor" (byte-identical to the legacy
 *   key, so existing root deployments keep their data with zero migration)
 * - any non-root base path -> "reactor--<slug>", e.g.
 *   "/reactor-project/vetra-studio/" -> "reactor--reactor-project-vetra-studio"
 *
 * @param basePath - The Connect base path (env.PH_CONNECT_BASE_PATH ||
 *   import.meta.env.BASE_URL); normalized internally.
 * @returns The storage namespace.
 *
 * @example
 * getStorageNamespace('/') // 'reactor'
 * getStorageNamespace('/reactor-project/vetra-studio/') // 'reactor--reactor-project-vetra-studio'
 */
export function getStorageNamespace(basePath: string): string {
  const normalized = normalizeBasePath(basePath);
  if (normalized === "/") {
    return ROOT_STORAGE_NAMESPACE;
  }
  const slug = normalized
    .slice(1, -1)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // A non-root base path whose slug normalizes to nothing (e.g. "/-/") must
  // not collapse into the root namespace and share its storage.
  return `${ROOT_STORAGE_NAMESPACE}--${slug || "default"}`;
}
