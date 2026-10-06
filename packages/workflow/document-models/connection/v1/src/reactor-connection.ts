import { ReactorConnectionConfigSchema } from "../gen/schema/zod.js";

// Reserved for REACTOR connections; any piece may bind it.
export const REACTOR_CONNECTOR_ID = "@powerhousedao/reactor#reactor";
export const REACTOR_LOCAL_ENDPOINT = "local";

// A REACTOR connection's config with absent fields left out.
export interface ReactorConnectionConfigValue {
  endpoint: typeof REACTOR_LOCAL_ENDPOINT;
  access?: "read";
}

export type ReactorConnectionConfigResult =
  | { ok: true; config: ReactorConnectionConfigValue }
  | { ok: false; error: string };

const CONFIG_KEYS = new Set(["endpoint", "access"]);

export function isReactorConnectorId(connectorId: string): boolean {
  return connectorId === REACTOR_CONNECTOR_ID;
}

export function defaultReactorConnectionConfig(): ReactorConnectionConfigValue {
  return { endpoint: REACTOR_LOCAL_ENDPOINT };
}

// Unknown keys are refused, so a misspelt field is never ignored.
export function parseReactorConnectionConfig(
  config: unknown,
): ReactorConnectionConfigResult {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    return {
      ok: false,
      error: "A reactor connection config must be an object",
    };
  }
  const unknownKey = Object.keys(config).find((key) => !CONFIG_KEYS.has(key));
  if (unknownKey) {
    return {
      ok: false,
      error: `Unknown reactor connection field "${unknownKey}"`,
    };
  }
  const parsed = ReactorConnectionConfigSchema().safeParse(config);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  const { endpoint, access } = parsed.data;
  if (endpoint !== REACTOR_LOCAL_ENDPOINT) {
    return {
      ok: false,
      error: `Reactor endpoint must be "${REACTOR_LOCAL_ENDPOINT}"`,
    };
  }
  if (access !== undefined && access !== null && access !== "read") {
    return { ok: false, error: `Reactor access must be "read" or absent` };
  }
  const value: ReactorConnectionConfigValue = { endpoint };
  if (access === "read") value.access = access;
  return { ok: true, config: value };
}
