import path from "node:path";

/**
 * `${userData}` resolution for host files (desktop shape): storage paths in a
 * host must not derive from the instance name (renames must stay safe), so
 * the host file writes `${userData}/.ph/reactor-storage` and the RUNNER
 * resolves it at start. `${userData}` is a PROJECT-SHAPED root: its `.ph`
 * subtree carries the same names the classic commands use under
 * `<project>/.ph` (see `resolvePhDir`). In the CLI it IS the project root, so
 * `ph run desktop` in a project shares the one `.ph` tree `ph vetra` uses;
 * a shell (Tauri) points it at the OS profile via PH_USER_DATA_DIR, and the
 * whole `.ph` tree — stores, identity, run records — follows.
 */
export function defaultUserDataDir(
  projectRoot: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return env.PH_USER_DATA_DIR ?? path.resolve(projectRoot);
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
