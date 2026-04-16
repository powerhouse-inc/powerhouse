export type PackagesConfig = {
  packages: string[];
  localPackage?: { name: string; version: string } | null;
};

function assertPackagesConfig(value: unknown): asserts value is PackagesConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error("ph-packages.json must be a JSON object");
  }

  const obj = value as Record<string, unknown>;

  if (!Array.isArray(obj.packages)) {
    throw new Error("ph-packages.json: 'packages' must be an array");
  }

  if (!obj.packages.every((item) => typeof item === "string")) {
    throw new Error("ph-packages.json: 'packages' must be an array of strings");
  }
}

let cached: PackagesConfig | undefined;

export async function loadPackagesConfig(): Promise<PackagesConfig> {
  if (cached) return cached;

  const basePath = import.meta.env.BASE_URL ?? "/";
  const url = `${basePath}ph-packages.json`;
  const res = await fetch(url);
  const json: unknown = await res.json();
  assertPackagesConfig(json);
  cached = json;
  return cached;
}

/**
 * Returns the cached config synchronously.
 * Must be called after `loadPackagesConfig()` has resolved.
 */
export function getPackagesConfig(): PackagesConfig {
  if (!cached) {
    throw new Error(
      "Packages config not loaded yet. Call loadPackagesConfig() first.",
    );
  }
  return cached;
}
