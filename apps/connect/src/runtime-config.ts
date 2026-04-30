export type RuntimePowerhouseConfig = {
  schemaVersion?: number;
  packages: string[];
  localPackage?: { name: string; version: string } | null;
};

const CURRENT_SCHEMA_VERSION = 1;

function assertRuntimePowerhouseConfig(
  value: unknown,
): asserts value is RuntimePowerhouseConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error("powerhouse.config.json must be a JSON object");
  }

  const obj = value as Record<string, unknown>;

  if (!Array.isArray(obj.packages)) {
    throw new Error("powerhouse.config.json: 'packages' must be an array");
  }

  if (!obj.packages.every((item) => typeof item === "string")) {
    throw new Error(
      "powerhouse.config.json: 'packages' must be an array of strings",
    );
  }
}

let cached: RuntimePowerhouseConfig | undefined;

export async function loadRuntimeConfig(): Promise<RuntimePowerhouseConfig> {
  if (cached) return cached;

  const basePath = import.meta.env.BASE_URL ?? "/";
  const url = `${basePath}powerhouse.config.json`;
  const res = await fetch(url);
  const json: unknown = await res.json();
  assertRuntimePowerhouseConfig(json);

  if (
    typeof json.schemaVersion === "number" &&
    json.schemaVersion !== CURRENT_SCHEMA_VERSION
  ) {
    console.warn(
      `powerhouse.config.json: unrecognized schemaVersion ${json.schemaVersion} (expected ${CURRENT_SCHEMA_VERSION}). Continuing — fields may be misinterpreted.`,
    );
  }

  cached = json;
  return cached;
}

/**
 * Returns the cached config synchronously.
 * Must be called after `loadRuntimeConfig()` has resolved.
 */
export function getRuntimeConfig(): RuntimePowerhouseConfig {
  if (!cached) {
    throw new Error(
      "Runtime config not loaded yet. Call loadRuntimeConfig() first.",
    );
  }
  return cached;
}
