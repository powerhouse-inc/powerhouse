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

const parseBool = (v: string): boolean => v.toLowerCase() === "true";
const invertBool = (v: string): boolean => v.toLowerCase() !== "true";
const parseNumber = (v: string): number => {
  const n = Number(v);
  if (Number.isNaN(n)) {
    throw new Error(`Cannot parse '${v}' as number`);
  }
  return n;
};

const parseDefaultDrivesUrl = (
  v: string,
): Array<{ url: string; name: null; icon: null }> =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((url) => ({ url, name: null, icon: null }));

// One entry per §B MIGRATE env var from CONNECT-ENV-AUDIT.md.
//
// Applied in order with "set if absent" semantics (see applyEnvSeeding). That
// means earlier rules win when two rules write the same path — used here for
// the CLOUD+PUBLIC → `remote` collapse: PH_CONNECT_CLOUD_* is listed before
// PH_CONNECT_PUBLIC_*, so if an operator sets both, CLOUD wins. This matches
// the audit's §B.2.7 note that CLOUD is the more recently coined name and
// PUBLIC predates the unified section semantics.
export const ENV_SEEDING_RULES: readonly EnvSeedingRule[] = [
  // connect.app
  { envVar: "PH_CONNECT_BASE_PATH", path: "app.basePath", parse: String },
  { envVar: "PH_CONNECT_LOG_LEVEL", path: "app.logLevel", parse: String },
  // connect.packages
  {
    envVar: "PH_CONNECT_EXTERNAL_PACKAGES_DISABLED",
    path: "packages.externalEnabled",
    parse: invertBool,
  },
  // connect.drives (top-level)
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
  {
    envVar: "PH_CONNECT_DRIVES_PRESERVE_STRATEGY",
    path: "drives.preserveStrategy",
    parse: String,
  },
  // connect.drives.sections.remote — CLOUD first (wins on collision), PUBLIC as legacy alias
  {
    envVar: "PH_CONNECT_CLOUD_DRIVES_ENABLED",
    path: "drives.sections.remote.enabled",
    parse: parseBool,
  },
  {
    envVar: "PH_CONNECT_DISABLE_ADD_CLOUD_DRIVES",
    path: "drives.sections.remote.allowAdd",
    parse: invertBool,
  },
  {
    envVar: "PH_CONNECT_DISABLE_DELETE_CLOUD_DRIVES",
    path: "drives.sections.remote.allowDelete",
    parse: invertBool,
  },
  {
    envVar: "PH_CONNECT_PUBLIC_DRIVES_ENABLED",
    path: "drives.sections.remote.enabled",
    parse: parseBool,
  },
  {
    envVar: "PH_CONNECT_DISABLE_ADD_PUBLIC_DRIVES",
    path: "drives.sections.remote.allowAdd",
    parse: invertBool,
  },
  {
    envVar: "PH_CONNECT_DISABLE_DELETE_PUBLIC_DRIVES",
    path: "drives.sections.remote.allowDelete",
    parse: invertBool,
  },
  // connect.drives.sections.local
  {
    envVar: "PH_CONNECT_LOCAL_DRIVES_ENABLED",
    path: "drives.sections.local.enabled",
    parse: parseBool,
  },
  {
    envVar: "PH_CONNECT_DISABLE_ADD_LOCAL_DRIVES",
    path: "drives.sections.local.allowAdd",
    parse: invertBool,
  },
  {
    envVar: "PH_CONNECT_DISABLE_DELETE_LOCAL_DRIVES",
    path: "drives.sections.local.allowDelete",
    parse: invertBool,
  },
  // connect.renown
  { envVar: "PH_CONNECT_RENOWN_URL", path: "renown.url", parse: String },
  {
    envVar: "PH_CONNECT_RENOWN_NETWORK_ID",
    path: "renown.networkId",
    parse: String,
  },
  {
    envVar: "PH_CONNECT_RENOWN_CHAIN_ID",
    path: "renown.chainId",
    parse: parseNumber,
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
