export const PLUGIN_HOST_FLAG = "FEATURE_PLUGIN_HOST_ENABLED";

export function isPluginHostEnabled(
  env: Record<string, string | undefined>,
): boolean {
  const value = env[PLUGIN_HOST_FLAG]?.trim().toLowerCase();
  return value === "1" || value === "true";
}

/** The values that ask for the deprecated inline boot, the ones the
 * deprecation warning names (shared/clis FALSE_VALUES). */
const INLINE_BOOT_VALUES: ReadonlySet<string> = new Set([
  "false",
  "0",
  "off",
  "no",
]);

/** What the variable asks for: true the declared composition, false the
 * deprecated inline boot. Blank or any other value asks for nothing, and the
 * default composition boots. */
export function pluginHostFromEnv(
  env: Record<string, string | undefined>,
): boolean | undefined {
  if (isPluginHostEnabled(env)) return true;
  const value = env[PLUGIN_HOST_FLAG]?.trim().toLowerCase();
  return value !== undefined && INLINE_BOOT_VALUES.has(value)
    ? false
    : undefined;
}
