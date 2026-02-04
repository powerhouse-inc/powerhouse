import {
  OpenFeature,
  type ErrorCode,
  type JsonValue,
  type Provider,
  type ResolutionDetails,
} from "@openfeature/web-sdk";
import type { ILogger } from "document-drive";
import { logger, setLogLevel } from "document-drive";
import { connectConfig } from "./connect.config.js";

/**
 * QueryParamProvider reads feature flags from URL query parameters.
 *
 * Usage:
 *   const params = new URLSearchParams(window.location.search);
 *   const provider = new QueryParamProvider(params);
 *   await OpenFeature.setProviderAndWait(provider);
 *
 * Query parameter format:
 *   ?FEATURE_DUAL_ACTION_CREATE_ENABLED=true&FEATURE_FOO=false
 */
export class QueryParamProvider implements Provider {
  public readonly runsOn = "client" as const;

  readonly metadata = {
    name: "QueryParamProvider",
  } as const;

  private flags: Map<string, string>;

  constructor(searchParams: URLSearchParams) {
    this.flags = new Map();

    // Extract all query parameters that look like feature flags
    for (const [key, value] of searchParams.entries()) {
      this.flags.set(key, value);
    }
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
  ): ResolutionDetails<boolean> {
    const value = this.flags.get(flagKey);

    if (value === undefined) {
      return {
        value: defaultValue,
        reason: "DEFAULT",
      };
    }

    // Parse boolean from string
    const boolValue = value.toLowerCase() === "true" || value === "1";

    return {
      value: boolValue,
      reason: "STATIC",
      variant: value,
    };
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
  ): ResolutionDetails<string> {
    const value = this.flags.get(flagKey);

    if (value === undefined) {
      return {
        value: defaultValue,
        reason: "DEFAULT",
      };
    }

    return {
      value,
      reason: "STATIC",
      variant: value,
    };
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
  ): ResolutionDetails<number> {
    const value = this.flags.get(flagKey);

    if (value === undefined) {
      return {
        value: defaultValue,
        reason: "DEFAULT",
      };
    }

    const numValue = Number(value);

    if (isNaN(numValue)) {
      return {
        value: defaultValue,
        reason: "ERROR",
        errorCode: "PARSE_ERROR" as ErrorCode,
        errorMessage: `Failed to parse "${value}" as a number`,
      };
    }

    return {
      value: numValue,
      reason: "STATIC",
      variant: value,
    };
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
  ): ResolutionDetails<T> {
    const value = this.flags.get(flagKey);

    if (value === undefined) {
      return {
        value: defaultValue,
        reason: "DEFAULT",
      };
    }

    try {
      const objValue = JSON.parse(value) as T;
      return {
        value: objValue,
        reason: "STATIC",
        variant: value,
      };
    } catch (error) {
      return {
        value: defaultValue,
        reason: "ERROR",
        errorCode: "PARSE_ERROR" as ErrorCode,
        errorMessage: `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

/**
 * Initialize OpenFeature with the QueryParamProvider.
 * Reads feature flags from query parameters.
 */
export async function initFeatureFlags(
  searchParams?: URLSearchParams,
): Promise<Map<string, boolean>> {
  const params =
    searchParams ??
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams());
  const provider = new QueryParamProvider(params);
  await OpenFeature.setProviderAndWait(provider);

  const features = new Map<string, boolean>();
  const client = OpenFeature.getClient();

  features.set(
    FEATURE_LEGACY_READ_ENABLED,
    client.getBooleanValue(
      FEATURE_LEGACY_READ_ENABLED,
      FEATURE_LEGACY_READ_ENABLED_DEFAULT,
    ),
  );
  features.set(
    FEATURE_LEGACY_WRITE_ENABLED,
    client.getBooleanValue(
      FEATURE_LEGACY_WRITE_ENABLED,
      FEATURE_LEGACY_WRITE_ENABLED_DEFAULT,
    ),
  );
  features.set(
    FEATURE_CHANNEL_SYNC_ENABLED,
    client.getBooleanValue(
      FEATURE_CHANNEL_SYNC_ENABLED,
      FEATURE_CHANNEL_SYNC_ENABLED_DEFAULT,
    ),
  );

  // Query param overrides env var for inspector
  const inspectorFromParam = params.has(FEATURE_INSPECTOR_ENABLED);
  const inspectorEnabled = inspectorFromParam
    ? client.getBooleanValue(
        FEATURE_INSPECTOR_ENABLED,
        FEATURE_INSPECTOR_ENABLED_DEFAULT,
      )
    : connectConfig.content.inspectorEnabled;
  features.set(FEATURE_INSPECTOR_ENABLED, inspectorEnabled);

  // Handle LOG_LEVEL query param override
  const logLevelParam = params.get("LOG_LEVEL");
  if (logLevelParam) {
    const validLogLevels = ["verbose", "debug", "info", "warn", "error"];
    if (validLogLevels.includes(logLevelParam.toLowerCase())) {
      setLogLevel(logLevelParam.toLowerCase() as ILogger["level"]);
      logger.info(
        "Log level set to @level via query param",
        logLevelParam.toLowerCase(),
      );
    } else {
      logger.warn(
        "Invalid LOG_LEVEL query param: @param. Valid values: @validLevels",
        logLevelParam,
        validLogLevels.join(", "),
      );
    }
  }

  return features;
}

const FEATURE_LEGACY_READ_ENABLED = "FEATURE_LEGACY_READ_ENABLED";
const FEATURE_LEGACY_READ_ENABLED_DEFAULT = false;

const FEATURE_LEGACY_WRITE_ENABLED = "FEATURE_LEGACY_WRITE_ENABLED";
const FEATURE_LEGACY_WRITE_ENABLED_DEFAULT = false;

const FEATURE_CHANNEL_SYNC_ENABLED = "FEATURE_CHANNEL_SYNC_ENABLED";
const FEATURE_CHANNEL_SYNC_ENABLED_DEFAULT = true;

const FEATURE_INSPECTOR_ENABLED = "FEATURE_INSPECTOR_ENABLED";
const FEATURE_INSPECTOR_ENABLED_DEFAULT = false;

/**
 * If true, reads go through legacy reactor.
 *
 * If false, reads go through the new reactor.
 */
export async function isLegacyReadEnabled(): Promise<boolean> {
  const client = OpenFeature.getClient();
  return Promise.resolve(
    client.getBooleanValue(
      FEATURE_LEGACY_READ_ENABLED,
      FEATURE_LEGACY_READ_ENABLED_DEFAULT,
    ),
  );
}

/**
 * If true, writes go through legacy reactor.
 *
 * If false, writes go through the new reactor.
 */
export async function isLegacyWriteEnabled(): Promise<boolean> {
  const client = OpenFeature.getClient();
  return Promise.resolve(
    client.getBooleanValue(
      FEATURE_LEGACY_WRITE_ENABLED,
      FEATURE_LEGACY_WRITE_ENABLED_DEFAULT,
    ),
  );
}

/**
 * If true, sync through channels and disables sync through legacy reactor.
 *
 * If false, sync through legacy reactor and disables sync through channels.
 */
export async function isChannelSyncEnabled(): Promise<boolean> {
  const client = OpenFeature.getClient();
  return Promise.resolve(
    client.getBooleanValue(
      FEATURE_CHANNEL_SYNC_ENABLED,
      FEATURE_CHANNEL_SYNC_ENABLED_DEFAULT,
    ),
  );
}

/**
 * If true, shows the inspector button in the sidebar.
 * Defaults to false (hidden).
 */
export async function isInspectorEnabled(): Promise<boolean> {
  const client = OpenFeature.getClient();
  return Promise.resolve(
    client.getBooleanValue(
      FEATURE_INSPECTOR_ENABLED,
      FEATURE_INSPECTOR_ENABLED_DEFAULT,
    ),
  );
}
