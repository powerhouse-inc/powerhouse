import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import type { RuntimePowerhouseConfig } from "@powerhousedao/shared/connect";

type RuntimePowerhouseConfigPayload = Omit<
  RuntimePowerhouseConfig,
  "connect"
> & {
  connect?: PHConnectRuntimeConfig;
};

const CURRENT_SCHEMA_VERSION = 2;

function assertOptionalString(
  value: unknown,
  path: string,
): asserts value is string | undefined {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`powerhouse.config.json: '${path}' must be a string`);
  }
}

function assertRuntimePowerhouseConfig(
  value: unknown,
): asserts value is RuntimePowerhouseConfigPayload {
  if (typeof value !== "object" || value === null) {
    throw new Error("powerhouse.config.json must be a JSON object");
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj.schemaVersion !== "number") {
    throw new Error(
      "powerhouse.config.json: missing or invalid 'schemaVersion'",
    );
  }

  if (obj.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `powerhouse.config.json: unsupported schemaVersion ${obj.schemaVersion} (expected ${CURRENT_SCHEMA_VERSION}). The SPA bundle and dist file must come from the same build.`,
    );
  }

  if (!Array.isArray(obj.packages)) {
    throw new Error("powerhouse.config.json: 'packages' must be an array");
  }

  for (const item of obj.packages) {
    if (typeof item !== "object" || item === null) {
      throw new Error(
        "powerhouse.config.json: each entry in 'packages' must be an object",
      );
    }
    const pkg = item as Record<string, unknown>;
    if (typeof pkg.packageName !== "string") {
      throw new Error(
        "powerhouse.config.json: each entry in 'packages' must have a 'packageName' string",
      );
    }
    assertOptionalString(pkg.version, "packages[].version");
    assertOptionalString(pkg.provider, "packages[].provider");
    assertOptionalString(pkg.url, "packages[].url");
  }

  const localPackage = obj.localPackage as Record<string, unknown> | null;
  if (
    obj.localPackage === undefined ||
    (localPackage !== null &&
      (typeof localPackage !== "object" ||
        typeof localPackage.name !== "string" ||
        typeof localPackage.version !== "string"))
  ) {
    throw new Error(
      "powerhouse.config.json: 'localPackage' must be null or an object with string 'name' and 'version'",
    );
  }

  if (obj.connect !== undefined) {
    if (typeof obj.connect !== "object" || obj.connect === null) {
      throw new Error("powerhouse.config.json: 'connect' must be an object");
    }
    const connect = obj.connect as Record<string, unknown>;
    if (connect.branding !== undefined) {
      if (typeof connect.branding !== "object" || connect.branding === null) {
        throw new Error(
          "powerhouse.config.json: 'connect.branding' must be an object",
        );
      }
      const branding = connect.branding as Record<string, unknown>;
      assertOptionalString(branding.appName, "connect.branding.appName");
      if (
        branding.homeBackground !== undefined &&
        branding.homeBackground !== null
      ) {
        if (
          typeof branding.homeBackground !== "object" ||
          branding.homeBackground === null
        ) {
          throw new Error(
            "powerhouse.config.json: 'connect.branding.homeBackground' must be null or an object",
          );
        }
        const homeBackground = branding.homeBackground as Record<
          string,
          unknown
        >;
        assertOptionalString(
          homeBackground.avif,
          "connect.branding.homeBackground.avif",
        );
        assertOptionalString(
          homeBackground.png,
          "connect.branding.homeBackground.png",
        );
      }
    }

    if (connect.drives !== undefined) {
      if (typeof connect.drives !== "object" || connect.drives === null) {
        throw new Error(
          "powerhouse.config.json: 'connect.drives' must be an object",
        );
      }
      const drives = connect.drives as Record<string, unknown>;
      if (
        drives.allowAddDrive !== undefined &&
        typeof drives.allowAddDrive !== "boolean"
      ) {
        throw new Error(
          "powerhouse.config.json: 'connect.drives.allowAddDrive' must be a boolean",
        );
      }
      if (drives.defaultDrives !== undefined) {
        if (!Array.isArray(drives.defaultDrives)) {
          throw new Error(
            "powerhouse.config.json: 'connect.drives.defaultDrives' must be an array",
          );
        }
        for (const drive of drives.defaultDrives) {
          if (typeof drive !== "object" || drive === null) {
            throw new Error(
              "powerhouse.config.json: each entry in 'connect.drives.defaultDrives' must be an object",
            );
          }
          const defaultDrive = drive as Record<string, unknown>;
          if (typeof defaultDrive.url !== "string") {
            throw new Error(
              "powerhouse.config.json: each entry in 'connect.drives.defaultDrives' must have a 'url' string",
            );
          }
          if (
            defaultDrive.name !== undefined &&
            defaultDrive.name !== null &&
            typeof defaultDrive.name !== "string"
          ) {
            throw new Error(
              "powerhouse.config.json: 'connect.drives.defaultDrives[].name' must be null or a string",
            );
          }
          if (
            defaultDrive.icon !== undefined &&
            defaultDrive.icon !== null &&
            typeof defaultDrive.icon !== "string"
          ) {
            throw new Error(
              "powerhouse.config.json: 'connect.drives.defaultDrives[].icon' must be null or a string",
            );
          }
        }
      }
    }
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

  cached = { ...json, connect: json.connect ?? {} };
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

export function applyConnectBranding(config: RuntimePowerhouseConfig): void {
  const appName = config.connect.branding?.appName;
  if (appName) document.title = appName;
}
