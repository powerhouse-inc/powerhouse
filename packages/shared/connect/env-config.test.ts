// Regression guard: Connect runtime values are sourced from
// `powerhouse.config.json`, not from env vars. If any of these keys come back
// into the env schema, the migration to file-based runtime config is broken.
//
// (Build metadata, Sentry, and analytics-processor toggles remain env-driven
// and ARE expected to be present in the schema — see the positive assertion
// at the bottom.)

import { describe, expect, it } from "vitest";
import { connectEnvSchema, runtimeEnvSchema } from "./env-config.js";

const REMOVED_RUNTIME_KEYS = [
  "PH_CONNECT_LOG_LEVEL",
  "PH_CONNECT_BASE_PATH",
  "PH_CONNECT_DEFAULT_DRIVES_URL",
  "PH_CONNECT_DRIVES_PRESERVE_STRATEGY",
  "PH_CONNECT_DISABLE_ADD_DRIVE",
  "PH_CONNECT_EXTERNAL_PACKAGES_DISABLED",
  "PH_CONNECT_PUBLIC_DRIVES_ENABLED",
  "PH_CONNECT_DISABLE_ADD_PUBLIC_DRIVES",
  "PH_CONNECT_DISABLE_DELETE_PUBLIC_DRIVES",
  "PH_CONNECT_LOCAL_DRIVES_ENABLED",
  "PH_CONNECT_DISABLE_ADD_LOCAL_DRIVES",
  "PH_CONNECT_DISABLE_DELETE_LOCAL_DRIVES",
  "PH_CONNECT_RENOWN_URL",
  "PH_CONNECT_RENOWN_NETWORK_ID",
  "PH_CONNECT_RENOWN_CHAIN_ID",
  "PH_CONNECT_PACKAGES_REGISTRY",
  "PH_DISABLE_LOCAL_PACKAGE",
] as const;

const KEPT_KEYS = [
  // Build metadata
  "PH_CONNECT_VERSION",
  "PH_CONNECT_CLI_VERSION",
  // Sentry
  "PH_CONNECT_SENTRY_DSN",
  "PH_CONNECT_SENTRY_ENV",
  "PH_CONNECT_SENTRY_RELEASE",
  "PH_CONNECT_SENTRY_TRACING_ENABLED",
  // Analytics processors
  "PH_CONNECT_DIFF_ANALYTICS_ENABLED",
  "PH_CONNECT_DRIVE_ANALYTICS_ENABLED",
  "PH_CONNECT_EXTERNAL_ANALYTICS_PROCESSORS_ENABLED",
  // Build env (used by Vite plugin, not runtime SPA)
  "PH_PACKAGES",
  "PH_LOCAL_PACKAGE",
  "PH_SENTRY_AUTH_TOKEN",
  "PH_SENTRY_ORG",
  "PH_SENTRY_PROJECT",
] as const;

describe("env-config regression guard", () => {
  it("does NOT include any of the removed runtime keys in the env schema", () => {
    const schemaKeys = new Set(Object.keys(connectEnvSchema.shape));
    for (const removed of REMOVED_RUNTIME_KEYS) {
      expect(schemaKeys.has(removed)).toBe(false);
    }
  });

  it("does NOT include any of the removed runtime keys in the runtime-only schema", () => {
    const runtimeKeys = new Set(Object.keys(runtimeEnvSchema.shape));
    for (const removed of REMOVED_RUNTIME_KEYS) {
      expect(runtimeKeys.has(removed)).toBe(false);
    }
  });

  it("still includes the kept env keys (Sentry, build metadata, analytics)", () => {
    const schemaKeys = new Set(Object.keys(connectEnvSchema.shape));
    for (const kept of KEPT_KEYS) {
      expect(schemaKeys.has(kept)).toBe(true);
    }
  });
});
