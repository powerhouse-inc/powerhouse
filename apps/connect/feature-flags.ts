import {
  OpenFeature,
  type ErrorCode,
  type JsonValue,
  type Provider,
  type ResolutionDetails,
} from "@openfeature/web-sdk";

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
): Promise<void> {
  const params =
    searchParams ??
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams());
  const provider = new QueryParamProvider(params);
  await OpenFeature.setProviderAndWait(provider);
}

/**
 * Helper function to check if dual action create is enabled via query param.
 */
export async function isDualActionCreateEnabled(): Promise<boolean> {
  const client = OpenFeature.getClient();
  return Promise.resolve(
    client.getBooleanValue("FEATURE_DUAL_ACTION_CREATE_ENABLED", false),
  );
}
