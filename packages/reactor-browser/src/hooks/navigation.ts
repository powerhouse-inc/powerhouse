import type {
  PHNavigateOptions,
  PHNavigation,
  PHNavigationTarget,
  PHSearchUpdate,
  PHSettingsTarget,
  SearchParamsUpdate,
} from "@powerhousedao/reactor-browser";
import { useMemo, useSyncExternalStore } from "react";
import { resolveUrlPathname } from "../utils/url.js";
import type { PHStore } from "./ph-store.js";
import { getPHStore, isScopedPHStore } from "./ph-store.js";

const isServer = typeof window === "undefined";

/** Fired on `window` when the fallback navigator rewrites the URL. */
export const PH_LOCATION_CHANGE_EVENT = "ph:locationchange";

/** Params read at boot or app-wide; they survive every navigation. Others,
 * e.g. a document's own, are dropped when the target changes. */
export const GLOBAL_SEARCH_PARAMS = [
  // A remote drive to add on boot.
  "driveUrl",
  // The theme override read by the inline theme boot script.
  "theme",
  // Embedded mode, which hides Connect's chrome.
  "embed",
  // Log level override for the feature-flag provider.
  "LOG_LEVEL",
  // The reactor worker runtime flag override.
  "reactorWorker",
] as const;

/** Feature flags are any `FEATURE_*` param, so they are retained by prefix. */
export const FEATURE_FLAG_PARAM_PREFIX = "FEATURE_";

/** Whether `key` is a param every navigation keeps. */
export function isGlobalSearchParam(key: string) {
  return (
    (GLOBAL_SEARCH_PARAMS as readonly string[]).includes(key) ||
    key.startsWith(FEATURE_FLAG_PARAM_PREFIX)
  );
}

function globalSearch(search: string) {
  return Object.fromEntries(
    Object.entries(searchToRecord(search)).filter(([key]) =>
      isGlobalSearchParam(key),
    ),
  );
}

/** A query string's params; repeated keys keep their last value. */
export function searchToRecord(search: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(search));
}

/** `prev` with `update` applied; an `undefined` value removes the key. */
export function applySearchUpdate(
  prev: Record<string, string>,
  update: PHSearchUpdate,
): Record<string, string> {
  const next = { ...prev };
  for (const [key, value] of Object.entries(update)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next;
}

/** `?a=1&b=2`, or an empty string for no params. */
export function recordToSearch(record: Record<string, string>) {
  const search = new URLSearchParams(record).toString();
  return search ? `?${search}` : "";
}

/** The settings page's path; its tabs are below it. */
export const SETTINGS_PATH = "/settings";

export function isSettingsTarget(
  target: PHNavigationTarget | undefined,
): target is PHSettingsTarget {
  return !!target && "settings" in target;
}

/** The pathname a target opens at, base path included. */
export function targetPathname(target: PHNavigationTarget | undefined) {
  if (!target) return resolveUrlPathname("/");
  if (isSettingsTarget(target)) {
    const { settings } = target;
    return resolveUrlPathname(
      settings === true ? SETTINGS_PATH : `${SETTINGS_PATH}/${settings}`,
    );
  }
  const { driveSlug, nodeSlug } = target;
  return resolveUrlPathname(
    nodeSlug ? `/d/${driveSlug}/${nodeSlug}` : `/d/${driveSlug}`,
  );
}

/** History state key: the index of the entry a document was opened from. */
export const OPENED_FROM_STATE_KEY = "phOpenedFrom";

// The fallback numbers its own entries; a router's history has its own index.
type BrowserEntryState = { phIndex?: number; phOpenedFrom?: number };

function browserEntryState(): BrowserEntryState {
  const state: unknown = window.history.state;
  return state && typeof state === "object" ? (state as BrowserEntryState) : {};
}

/** The index to go back to from `index`, when it lies before it. */
export function openedFromIndex(
  state: object | undefined,
  index: number,
): number | undefined {
  const from = (state as Record<string, unknown> | undefined)?.[
    OPENED_FROM_STATE_KEY
  ];
  return typeof from === "number" && from >= 0 && from < index
    ? from
    : undefined;
}

// `openedFrom` "keep" carries the current entry's, as an in-document write does.
function writeBrowserUrl(
  href: string,
  replace: boolean | undefined,
  openedFrom: number | "keep" | undefined,
) {
  const prev = browserEntryState();
  const index = prev.phIndex ?? 0;
  const from = openedFrom === "keep" ? prev.phOpenedFrom : openedFrom;
  // Keeps the entry's state, e.g. a router's history key, on a replace.
  if (replace) {
    window.history.replaceState(
      { ...prev, phIndex: index, phOpenedFrom: from },
      "",
      href,
    );
  } else {
    window.history.pushState(
      { phIndex: index + 1, phOpenedFrom: from },
      "",
      href,
    );
  }
  window.dispatchEvent(new Event(PH_LOCATION_CHANGE_EVENT));
}

function subscribeToLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(PH_LOCATION_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(PH_LOCATION_CHANGE_EVENT, onChange);
  };
}

const readSearch = () => window.location.search;
const readPathname = () => window.location.pathname;
const readServerPathname = () => "";
const readServerSearch = () => "";

function setBrowserSearch(
  update: (prev: Record<string, string>) => PHSearchUpdate,
  options?: { replace?: boolean },
) {
  const prev = searchToRecord(window.location.search);
  const next = recordToSearch(applySearchUpdate({}, update(prev)));
  if (next === recordToSearch(prev)) return;
  // Like a router's search update, this drops the hash.
  writeBrowserUrl(
    `${window.location.pathname}${next}`,
    options?.replace,
    "keep",
  );
}

function setBrowserSearchParams(
  update: SearchParamsUpdate,
  options?: { replace?: boolean },
) {
  setBrowserSearch((prev) => resolveSearchUpdate(prev, update), options);
}

/** The fallback without a host: `window.location` and `window.history`. Only
 * the global params carry over to another target, as with a router. */
// Set by sync-selection.ts, which imports this module: importing it here would be a cycle.
let syncSelectionAfterOpen = () => {};

/** @internal Selects what the browser fallback opens; sync-selection.ts sets it. */
export function setBrowserOpenSync(sync: () => void) {
  syncSelectionAfterOpen = sync;
}

export const browserNavigation: PHNavigation = {
  location: () => window.location,
  hrefFor: (target) =>
    `${targetPathname(target)}${recordToSearch(globalSearch(window.location.search))}`,
  useIsCurrent(target) {
    const pathname = useSyncExternalStore(
      subscribeToLocation,
      readPathname,
      readServerPathname,
    );
    return pathname === targetPathname(target);
  },
  open: (target, options) => {
    const prev = globalSearch(window.location.search);
    const search = options?.search
      ? applySearchUpdate(prev, options.search)
      : prev;
    const entry = browserEntryState();
    writeBrowserUrl(
      `${targetPathname(target)}${recordToSearch(search)}`,
      options?.replace,
      options?.replace ? entry.phOpenedFrom : (entry.phIndex ?? 0),
    );
    // No router selects for it, and pushState fires no popstate.
    syncSelectionAfterOpen();
  },
  closeOpened: () => {
    const entry = browserEntryState();
    const index = entry.phIndex ?? 0;
    const from = openedFromIndex(entry, index);
    if (from === undefined) return false;
    window.history.go(from - index);
    return true;
  },
  setSearch: setBrowserSearch,
  useSearchParams() {
    const search = useSyncExternalStore(
      subscribeToLocation,
      readSearch,
      readServerSearch,
    );
    return useMemo(() => searchToRecord(search), [search]);
  },
  useSetSearchParams: () => setBrowserSearchParams,
};

const NO_PARAMS: Record<string, string> = {};
const noop = () => {};

// A scope without a navigation of its own: no URL, so opening only selects.
const detachedNavigation: PHNavigation = {
  location: () => ({ pathname: "", search: "" }),
  open: noop,
  setSearch: noop,
  useSearchParams: () => NO_PARAMS,
  useSetSearchParams: () => noop,
};

/** The navigation `store` acts through: a scope's own, else the app's. */
export function getNavigationOf(store: PHStore | undefined): PHNavigation {
  if (store && isScopedPHStore(store)) {
    return store.navigation ?? detachedNavigation;
  }
  return store?.navigation ?? getPHNavigation();
}

/** True when the store has a host navigation, not the browser fallback. */
export function hasHostNavigation() {
  return !isServer && getPHStore()?.navigation !== undefined;
}

/** The app store's navigation, else the browser fallback. */
export function getPHNavigation(): PHNavigation {
  return getPHStore()?.navigation ?? browserNavigation;
}

/** The current pathname as the navigation sees it, base path included. */
export function getCurrentPathname() {
  return getPHNavigation().location().pathname;
}

/** Opens `target`; without `search`, a target already open is left alone. */
export function openTarget(
  target: PHNavigationTarget | undefined,
  options?: PHNavigateOptions,
) {
  openTargetWith(getPHNavigation(), target, options);
}

/** Opens `target` through `navigation`, unless it is open already. */
export function openTargetWith(
  navigation: PHNavigation,
  target: PHNavigationTarget | undefined,
  options?: PHNavigateOptions,
) {
  const pathname = navigation.location().pathname;
  const targetPath = targetPathname(target);
  // On any tab, the settings page is open.
  const open =
    targetPath === pathname ||
    (isSettingsTarget(target) &&
      target.settings === true &&
      pathname.startsWith(`${targetPath}/`));
  if (!options?.search && open) return;
  navigation.open(target, options);
}

/** Asks the host navigation to warm `target`; a no-op without one. */
export function preloadTarget(target: PHNavigationTarget | undefined) {
  if (!hasHostNavigation()) return;
  getPHNavigation().preload?.(target);
}

/** The href `target` opens at through `navigation`, base path included. */
export function getTargetHref(
  target: PHNavigationTarget | undefined,
  navigation: PHNavigation = getPHNavigation(),
) {
  return navigation.hrefFor?.(target) ?? targetPathname(target);
}

export function resolveSearchUpdate(
  prev: Record<string, string>,
  update: SearchParamsUpdate,
): Record<string, string> {
  return typeof update === "function"
    ? applySearchUpdate({}, update(prev))
    : applySearchUpdate(prev, update);
}

/** Rewrites the current query params through the app store's navigation. */
export function setSearchParams(
  update: SearchParamsUpdate,
  options?: { replace?: boolean },
) {
  getPHNavigation().setSearch(
    (prev) => resolveSearchUpdate(prev, update),
    options,
  );
}
