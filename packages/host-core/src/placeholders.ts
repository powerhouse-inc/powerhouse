import path from "node:path";

/**
 * `${userData}` resolution for host files (desktop shape): storage paths in a
 * host must not derive from the instance name (renames must stay safe), so
 * the host file writes `${userData}/pglite` and the RUNNER resolves it at
 * start. In the CLI the default userData is `<projectRoot>/.ph/user-data`;
 * a shell (Tauri) overrides it via PH_USER_DATA_DIR to the OS profile dir.
 */
export function defaultUserDataDir(
  projectRoot: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return env.PH_USER_DATA_DIR ?? path.join(projectRoot, ".ph", "user-data");
}

const PLACEHOLDER = /\$\{userData\}/g;

/** Deep-substitute `${userData}` in every string of a JSON-shaped value.
 * Non-strings pass through; the input is never mutated. */
export function resolveUserDataPlaceholders<T>(value: T, userData: string): T {
  if (typeof value === "string") {
    return value.replace(PLACEHOLDER, userData) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) =>
      resolveUserDataPlaceholders<unknown>(v, userData),
    ) as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveUserDataPlaceholders(v, userData);
    }
    return out as T;
  }
  return value;
}
