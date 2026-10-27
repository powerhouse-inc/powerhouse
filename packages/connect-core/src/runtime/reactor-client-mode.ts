import type { PHReactorClientMode } from "@powerhousedao/shared/clis";
import { getRuntimeConfig } from "./runtime-config.js";
import { isMultiReactorEnabled } from "./multi-reactor-flag.js";
import { isReactorWorkerEnabled } from "./reactor-worker-flag.js";

/**
 * Which of the four reactor clients Connect boots. Standardized by the
 * multi-reactor work; this resolves the single selector Connect acts on:
 *
 *   in-process | worker | remote | router
 *
 * Precedence: an explicit `?reactorClient=` query override (kept in
 * localStorage so it survives a reload), then a stored override, then the
 * served `connect.instance.reactorClient` (projected from the host's reactor
 * backends), then the LEGACY booleans — so a config that only sets
 * reactorWorker/multiReactor behaves exactly as before.
 *
 * `remote` is the only mode that builds NO local reactor (no PGlite): it is a
 * pure client to a remote Switchboard. `router` keeps the local reactor and
 * adds remote backends; `worker`/`in-process` are the local reactor alone.
 */
export type ReactorClientMode = PHReactorClientMode;

const MODES: ReadonlySet<string> = new Set([
  "in-process",
  "worker",
  "remote",
  "router",
]);

export const REACTOR_CLIENT_QUERY_KEY = "reactorClient";
export const REACTOR_CLIENT_STORAGE_KEY = "ph:reactorClient";

const asMode = (value: string | null | undefined) =>
  value && MODES.has(value) ? (value as ReactorClientMode) : undefined;

function fromTab(): ReactorClientMode | undefined {
  if (typeof window === "undefined") return undefined;
  let query: ReactorClientMode | undefined;
  try {
    query = asMode(
      new URLSearchParams(window.location.search).get(REACTOR_CLIENT_QUERY_KEY),
    );
  } catch {
    return undefined;
  }
  try {
    if (query) {
      window.localStorage.setItem(REACTOR_CLIENT_STORAGE_KEY, query);
      return query;
    }
    return asMode(window.localStorage.getItem(REACTOR_CLIENT_STORAGE_KEY));
  } catch {
    // Blocked storage: the query still applies for this page load.
    return query;
  }
}

export function resolveReactorClientMode(): ReactorClientMode {
  const override = fromTab();
  if (override) return override;
  const configured = getRuntimeConfig().connect.instance?.reactorClient;
  if (configured && MODES.has(configured)) return configured;
  // Legacy fallback — unchanged behaviour for configs without reactorClient.
  if (isMultiReactorEnabled()) return "router";
  if (isReactorWorkerEnabled()) return "worker";
  return "in-process";
}
