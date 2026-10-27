export const PLUGIN_HOST_FLAG = "FEATURE_PLUGIN_HOST_ENABLED";

export function isPluginHostEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const value = env[PLUGIN_HOST_FLAG]?.trim().toLowerCase();
  return value === "1" || value === "true";
}
