// Maps PH_CONNECT_* env vars to runtime-config field paths under the
// `connect.*` object. Used by:
//
//   - The Vite plugin (build-time seeding) — packages/builder-tools/
//     connect-utils/vite-plugins/ph-config.ts
//   - The Docker entrypoint (container-start seeding) —
//     docker/connect-entrypoint.sh
//
// Both apply the same `//=` ("set if absent") semantics so that env vars
// only seed the file ONCE; subsequent operator edits to the file always
// win and survive container restarts. See CONNECT-CONFIG.md §13 for the
// design.
//
// To extend: add an entry. The Vite plugin and the entrypoint pick it up
// automatically (entrypoint regenerates its case list from this module).

import type { PHConnectRuntimeConfig } from "../clis/types.js";

export type EnvSeedingRule = {
  envVar: string;
  /** Dot-separated path inside `connect.*` (e.g. "drives.allowAddDrive"). */
  path: string;
  /** Coerce the env-var string into the field's runtime-config value. */
  parse: (value: string) => unknown;
};

const invertBool = (v: string): boolean => v.toLowerCase() !== "true";

const parseDefaultDrivesUrl = (
  v: string,
): Array<{ url: string; name: null; icon: null }> =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((url) => ({ url, name: null, icon: null }));

// Initial Cat 2 entries — covers the three fields acaldas's PR review
// table called out (DISABLE_ADD_DRIVE, DEFAULT_DRIVES_URL, PACKAGES).
// PH_CONNECT_PACKAGES is already wired through the build pipeline into
// the top-level `packages[]` array, so it's not re-seeded here.
//
// Other Cat 2 fields from CONNECT-CONFIG.md §13.3 (drive section toggles,
// editor lists, UI flags, etc.) follow the same pattern and will be added
// here in subsequent commits as their schema fields land.
export const ENV_SEEDING_RULES: readonly EnvSeedingRule[] = [
  {
    envVar: "PH_CONNECT_DISABLE_ADD_DRIVE",
    path: "drives.allowAddDrive",
    parse: invertBool,
  },
  {
    envVar: "PH_CONNECT_DEFAULT_DRIVES_URL",
    path: "drives.defaultDrives",
    parse: parseDefaultDrivesUrl,
  },
];

/**
 * Returns true when the dotted path resolves to a defined value inside obj.
 * `null` counts as defined; `undefined` does not (matches `//=` semantics
 * we use in the Docker entrypoint via jq).
 */
function hasPath(obj: unknown, dotted: string): boolean {
  const parts = dotted.split(".");
  let cur: unknown = obj;
  for (const key of parts) {
    if (cur === null || typeof cur !== "object") return false;
    if (!(key in (cur as Record<string, unknown>))) return false;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur !== undefined;
}

/**
 * Returns a new object with `value` set at the dotted path. Creates
 * intermediate objects as needed. Does not mutate the input.
 */
function setPath(obj: unknown, dotted: string, value: unknown): unknown {
  const parts = dotted.split(".");
  const root: Record<string, unknown> =
    obj && typeof obj === "object"
      ? { ...(obj as Record<string, unknown>) }
      : {};
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = cur[key];
    cur[key] =
      next && typeof next === "object"
        ? { ...(next as Record<string, unknown>) }
        : {};
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
  return root;
}

export type SeedReport = {
  envVar: string;
  path: string;
  value: unknown;
};

/**
 * Apply env→runtime-config seeding rules to a `connect.*` object.
 *
 * For each rule, if the env var is set AND the path is absent from the
 * input, write the parsed value at that path. Returns the (possibly
 * updated) object plus a report of which seeds fired.
 */
export function applyEnvSeeding(
  baseConnect: PHConnectRuntimeConfig,
  env: Readonly<Record<string, string | undefined>>,
  rules: readonly EnvSeedingRule[] = ENV_SEEDING_RULES,
): { connect: PHConnectRuntimeConfig; seeded: SeedReport[] } {
  let result: unknown = baseConnect;
  const seeded: SeedReport[] = [];

  for (const rule of rules) {
    const raw = env[rule.envVar];
    if (raw === undefined || raw === "") continue;
    if (hasPath(result, rule.path)) continue;
    const value = rule.parse(raw);
    result = setPath(result, rule.path, value);
    seeded.push({ envVar: rule.envVar, path: rule.path, value });
  }

  return { connect: result as PHConnectRuntimeConfig, seeded };
}
