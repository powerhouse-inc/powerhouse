/**
 * One descriptor name maps to one storage namespace and one SharedWorker
 * name, so N named reactors coexist in one origin without sharing a store or
 * a worker. Both derivations are pure and exported because the worker entry
 * and the tab-side wiring must agree on them without a round trip.
 */

/** Characters IndexedDB names and SharedWorker names both tolerate. */
const SAFE = /[^a-zA-Z0-9._-]+/g;

export const MONITOR_STORAGE_PREFIX = "reactor-monitor";
export const MONITOR_WORKER_PREFIX = "ph-reactor-monitor";

/** A descriptor name, reduced to something safe to use in a store name. */
export function normalizeReactorName(name: string): string {
  const slug = name
    .trim()
    .replace(SAFE, "-")
    .replace(/^-+|-+$/g, "");
  if (slug === "") {
    throw new Error(
      `Invalid reactor name ${JSON.stringify(name)}: a name must contain at least one letter, digit, ".", "_" or "-"`,
    );
  }
  return slug;
}

/** PGlite store namespace for `name` — the `idb://` database name. */
export function reactorStorageNamespace(name: string): string {
  return `${MONITOR_STORAGE_PREFIX}-${normalizeReactorName(name)}`;
}

/** SharedWorker name for `name`; one worker instance per reactor name. */
export function reactorWorkerName(name: string): string {
  return `${MONITOR_WORKER_PREFIX}:${normalizeReactorName(name)}`;
}
