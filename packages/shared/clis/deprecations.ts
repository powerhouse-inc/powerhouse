/**
 * Things that still work in this release and stop working in the next one:
 * the classic commands, their flags, and the configuration the host files
 * replace. Each one warns once per invocation, on stderr, and changes nothing
 * else. Retired environment variables (no effect any more) are in
 * `retired-flags.ts`.
 */

import { FALSE_VALUES } from "./retired-flags.js";

/** The first release without the deprecated behaviour. */
export const DEPRECATIONS_REMOVED_IN = "6.4";

/** The migration page every deprecation warning links to. */
export const MIGRATION_GUIDE_URL =
  "https://academy.vetra.io/academy/Reference/HostsAndRunners/MigratingToHosts";

/**
 * The ids a process has warned about, comma separated. The CLIs it spawns
 * inherit it, so one invocation warns once per id.
 */
export const DEPRECATIONS_WARNED_ENV = "PH_DEPRECATIONS_WARNED";

export interface Deprecation {
  /** Stable per subject, e.g. `flag:FEATURE_PLUGIN_HOST_ENABLED`. */
  id: string;
  /** What is deprecated, what replaces it and when it goes, as sentences. */
  text: string;
}

type Env = Record<string, string | undefined>;

function warnedIds(env: Env): string[] {
  return (env[DEPRECATIONS_WARNED_ENV] ?? "").split(",").filter(Boolean);
}

/** Whether this invocation already warned about `id`. */
export function deprecationWarned(id: string, env: Env = process.env): boolean {
  return warnedIds(env).includes(id);
}

/** Marks `id` as warned about, for this process and the CLIs it spawns. */
export function markDeprecationWarned(
  id: string,
  env: Env = process.env,
): void {
  const ids = warnedIds(env);
  if (ids.includes(id)) return;
  env[DEPRECATIONS_WARNED_ENV] = [...ids, id].join(",");
}

/** The line a deprecation prints: its text and the migration link. */
export function formatDeprecation(text: string): string {
  return `Warning: ${text} See ${MIGRATION_GUIDE_URL}`;
}

/**
 * Prints one warning per deprecation to stderr, once per id and invocation.
 * Returns the ones it printed.
 */
export function warnDeprecations(
  deprecations: readonly Deprecation[],
  env: Env = process.env,
  warn: (text: string) => void = (text) => console.warn(text),
): Deprecation[] {
  const printed: Deprecation[] = [];
  for (const deprecation of deprecations) {
    if (deprecationWarned(deprecation.id, env)) continue;
    warn(formatDeprecation(deprecation.text));
    markDeprecationWarned(deprecation.id, env);
    printed.push(deprecation);
  }
  return printed;
}

export interface DeprecatedFlag {
  /** The environment variable. */
  name: string;
  /** Which values ask for the behaviour that goes: a false one, or any. */
  when: "false" | "set";
  /** What the value still does, and what replaces it, as full sentences. */
  message: string;
}

/**
 * Environment variables that still switch something the next release removes.
 * `MCP_ENABLED` and `PH_WORKFLOWS_ENABLED` are not here: they stay. None at
 * the moment: `FEATURE_PLUGIN_HOST_ENABLED` moved to `retired-flags.ts`.
 */
export const deprecatedFlags: readonly DeprecatedFlag[] = [];

/** The deprecated variables that `env` still sets in the way their entry names. */
export function findDeprecatedFlags(
  env: Env = process.env,
  flags: readonly DeprecatedFlag[] = deprecatedFlags,
): Deprecation[] {
  const found: Deprecation[] = [];
  for (const flag of flags) {
    const value = env[flag.name];
    if (value === undefined) continue;
    const normalized = value.trim().toLowerCase();
    const hit =
      flag.when === "set" ? normalized !== "" : FALSE_VALUES.has(normalized);
    if (!hit) continue;
    found.push({
      id: `flag:${flag.name}`,
      text: `${flag.name}=${value} stops working in ${DEPRECATIONS_REMOVED_IN}. ${flag.message}`,
    });
  }
  return found;
}

/** Run at CLI start, next to `checkRetiredFlags`. */
export function checkDeprecatedFlags(
  env: Env = process.env,
  flags: readonly DeprecatedFlag[] = deprecatedFlags,
  warn?: (text: string) => void,
): void {
  warnDeprecations(findDeprecatedFlags(env, flags), env, warn);
}

/**
 * powerhouse.config.json keys the host files supersede, with their new home.
 * Since DEPRECATIONS_REMOVED_IN nothing reads them and `ph run` refuses a
 * project that still sets one; `ph migrate` moves the ones it can. `null`: no
 * host setting replaces the key.
 *
 * Keys the scaffolded host files reference (studio.port, reactor.port,
 * vetra.connectPort, assistant.port and the whole connect.* block) stay in a
 * migrated project and are not in this table.
 */
export const supersededConfigKeys: Readonly<Record<string, string | null>> = {
  "studio.host": "runner.host in hosts/connect/host.js",
  // The connect runner has no https option: a Connect host serves http.
  "studio.https": null,
  "studio.openBrowser": "runner.openBrowser in hosts/connect/host.js",
  "reactor.https":
    "config.switchboard.server.https in hosts/switchboard/host.js",
  "reactor.storage":
    "reactor.backends.<name>.storage in hosts/switchboard/host.js",
  "switchboard.database.url":
    "reactor.backends.<name>.storage.url in hosts/switchboard/host.js",
};

/**
 * Connect chrome keys the classic Connect reads from the top level of
 * powerhouse.config.json. Under hosts the generic plugin's config in
 * hosts/connect/host.js carries them, so only a host without plugins warns.
 */
export const connectChromeConfigKeys: readonly string[] = [
  "connect.drives.allowAddDrive",
  "connect.drives.sections",
  "connect.drives.icons",
  "connect.home.background",
];

function lookup(config: unknown, dottedKey: string): unknown {
  let cursor: unknown = config;
  for (const part of dottedKey.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

/** The keys of `keys` that `config` (a parsed powerhouse.config.json) sets. */
export function presentConfigKeys(
  config: unknown,
  keys: readonly string[],
): string[] {
  return keys.filter((key) => lookup(config, key) !== undefined);
}

/**
 * The error for a project whose powerhouse.config.json still sets `keys` of
 * the superseded table: one line per key with where its value lives now, then
 * `ph migrate` and the migration page.
 */
export function supersededConfigKeysError(keys: readonly string[]): string {
  const lines = keys.map((key) => {
    const home = supersededConfigKeys[key];
    return (
      `powerhouse.config.json "${key}" was removed in ${DEPRECATIONS_REMOVED_IN}. ` +
      (home
        ? `Set ${home} and remove the key.`
        : "No host setting replaces it: remove the key.")
    );
  });
  return [
    ...lines,
    `\`ph migrate\` moves the keys it can and says what to do with the rest. See ${MIGRATION_GUIDE_URL}`,
  ].join("\n");
}
