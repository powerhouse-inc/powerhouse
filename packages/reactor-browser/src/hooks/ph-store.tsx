import type { PHGlobal, PHGlobalKey } from "@powerhousedao/reactor-browser";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect } from "react";

/** PH state of one app (or one server request); assigning a key notifies. */
export type PHStore = PHGlobal;

type Listeners = Map<PropertyKey, Set<() => void>>;

// Listeners per key; ALL_KEYS hears every change.
const ALL_KEYS = Symbol("all keys");
const listenersByStore = new WeakMap<PHStore, Listeners>();
// Stores bound to window.ph; their changes also fire `ph:<key>Updated`.
const windowBound = new WeakSet<Listeners>();
const subscribeCache = new WeakMap<
  PHStore,
  Map<PropertyKey, (listener: () => void) => () => void>
>();

function notifyKey(listeners: Listeners, key: PropertyKey) {
  for (const set of [listeners.get(key), listeners.get(ALL_KEYS)]) {
    for (const listener of set ?? []) listener();
  }
  // Another bundled copy of reactor-browser subscribes through window events.
  if (windowBound.has(listeners) && typeof key === "string") {
    window.dispatchEvent(new CustomEvent(`ph:${key}Updated`));
  }
}

export function createPHStore(initial: PHGlobal = {}): PHStore {
  const listeners: Listeners = new Map();
  const store = new Proxy<PHGlobal>(
    { ...initial },
    {
      set: (target, key, value) => {
        if (Reflect.get(target, key) === value) return true;
        Reflect.set(target, key, value);
        notifyKey(listeners, key);
        return true;
      },
      deleteProperty: (target, key) => {
        Reflect.deleteProperty(target, key);
        notifyKey(listeners, key);
        return true;
      },
    },
  );
  listenersByStore.set(store, listeners);
  return store;
}

/** The keys a scoped store owns; every other key reads and writes its parent. */
export const SCOPED_PH_KEYS = [
  "selectedDriveId",
  "selectedNodeId",
  "navigation",
] as const satisfies readonly PHGlobalKey[];

export type ScopedPHKey = (typeof SCOPED_PH_KEYS)[number];
export type ScopedPHStoreOverrides = Pick<PHGlobal, ScopedPHKey>;

const scopedKeys = new Set<PropertyKey>(SCOPED_PH_KEYS);
const parentOfScope = new WeakMap<PHStore, PHStore>();

/** A store with its own selection and navigation over `parent`, e.g. for an
 * editor shown beside others; provide it with {@link PHStoreProvider}. */
export function createScopedPHStore(
  parent: PHStore,
  overrides: ScopedPHStoreOverrides = {},
): PHStore {
  const listeners: Listeners = new Map();
  const own: PHGlobal = {};
  for (const key of SCOPED_PH_KEYS) {
    if (overrides[key] !== undefined) Reflect.set(own, key, overrides[key]);
  }
  const store = new Proxy<PHGlobal>(own, {
    get: (target, key): unknown =>
      scopedKeys.has(key) ? Reflect.get(target, key) : Reflect.get(parent, key),
    has: (target, key) =>
      scopedKeys.has(key) ? Reflect.has(target, key) : Reflect.has(parent, key),
    set: (target, key, value) => {
      if (!scopedKeys.has(key)) return Reflect.set(parent, key, value);
      if (Reflect.get(target, key) === value) return true;
      Reflect.set(target, key, value);
      notifyKey(listeners, key);
      return true;
    },
    deleteProperty: (target, key) => {
      if (!scopedKeys.has(key)) return Reflect.deleteProperty(parent, key);
      Reflect.deleteProperty(target, key);
      notifyKey(listeners, key);
      return true;
    },
  });
  listenersByStore.set(store, listeners);
  parentOfScope.set(store, parent);
  return store;
}

/** Whether `store` was made by {@link createScopedPHStore}. */
export function isScopedPHStore(store: PHStore | undefined) {
  return !!store && parentOfScope.has(store);
}

function listenersOf(store: PHStore) {
  const listeners = listenersByStore.get(store);
  if (!listeners) throw new Error("Not a store made by createPHStore");
  return listeners;
}

/** Subscribes to changes of `key`, or of every key when omitted. */
export function subscribePHStore(
  store: PHStore,
  listener: () => void,
  key: PHGlobalKey | typeof ALL_KEYS = ALL_KEYS,
): () => void {
  const parent = parentOfScope.get(store);
  // A scope hears its parent for the keys it reads through.
  if (parent && !scopedKeys.has(key)) {
    const fromParent = subscribePHStore(parent, listener, key);
    if (key !== ALL_KEYS) return fromParent;
    const fromScope = subscribeOwn(store, listener, key);
    return () => {
      fromParent();
      fromScope();
    };
  }
  return subscribeOwn(store, listener, key);
}

function subscribeOwn(store: PHStore, listener: () => void, key: PropertyKey) {
  const listeners = listenersOf(store);
  const set = listeners.get(key) ?? new Set();
  listeners.set(key, set);
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

/** Notifies `key`'s listeners without a change, as re-setting a value does. */
export function notifyPHStore(store: PHStore, key: PHGlobalKey) {
  const parent = parentOfScope.get(store);
  if (parent && !scopedKeys.has(key)) notifyPHStore(parent, key);
  else notifyKey(listenersOf(store), key);
}

/** A subscribe for `key`, stable per store as useSyncExternalStore expects. */
export function getPHStoreSubscribe(store: PHStore, key?: PHGlobalKey) {
  const cacheKey = key ?? ALL_KEYS;
  const cache =
    subscribeCache.get(store) ??
    new Map<PropertyKey, (listener: () => void) => () => void>();
  subscribeCache.set(store, cache);
  let subscribe = cache.get(cacheKey);
  if (!subscribe) {
    subscribe = (listener: () => void) =>
      subscribePHStore(store, listener, cacheKey);
    cache.set(cacheKey, subscribe);
  }
  return subscribe;
}

let activeStore: PHStore | undefined;

/** The store bound with {@link bindPHStoreToWindow}, if any. */
export function getActivePHStore() {
  return activeStore;
}

/** The app's state outside React: the bound store, else `window.ph`. */
export function getPHStore(): PHStore | undefined {
  if (activeStore) return activeStore;
  return typeof window === "undefined" ? undefined : window.ph;
}

/** The bound store; otherwise binds `window.ph` if it is a store, else a new
 * store that takes over a plain `window.ph`'s values. */
export function ensurePHStore(): PHStore {
  if (activeStore) return activeStore;
  const current = typeof window === "undefined" ? undefined : window.ph;
  const store =
    current && listenersByStore.has(current) ? current : createPHStore();
  bindPHStoreToWindow(store);
  return store;
}

/** Makes `store` the app's state and `window.ph`; values set on a plain
 * `window.ph` carry over where `store` has none. */
export function bindPHStoreToWindow(store: PHStore) {
  activeStore = store;
  if (typeof window === "undefined") return;
  const previous = window.ph;
  const previousListeners = previous && listenersByStore.get(previous);
  // A previously bound store is replaced, not merged.
  if (previousListeners) windowBound.delete(previousListeners);
  else if (previous) {
    for (const [key, value] of Object.entries(previous)) {
      if (!(key in store)) Reflect.set(store, key, value);
    }
  }
  windowBound.add(listenersOf(store));
  window.ph = store;
}

const PHStoreContext = createContext<PHStore | undefined>(undefined);

// Scoped stores provided right now; plain setters warn while any is.
let mountedScopes = 0;
const warned = new Set<string>();

function isProduction() {
  // `process` need not exist in a browser bundle.
  return (
    typeof process !== "undefined" && process.env?.NODE_ENV === "production"
  );
}

/** Warns once in development when a global setter runs while a scoped store
 * is mounted, since it acts on the app's store and not the scope's. */
export function warnGlobalSetterInScope(setter: string, hook: string) {
  if (mountedScopes === 0 || warned.has(setter) || isProduction()) return;
  warned.add(setter);
  console.warn(
    `${setter} acts on the app's PH store while a scoped store is mounted; inside a scope, use ${hook}.`,
  );
}

/** Hooks below read from `store`; without a provider they read `window.ph`. */
export function PHStoreProvider(props: {
  store: PHStore;
  children: ReactNode;
}) {
  const scoped = isScopedPHStore(props.store);
  useEffect(() => {
    if (!scoped) return;
    mountedScopes++;
    return () => {
      mountedScopes--;
    };
  }, [scoped]);
  return (
    <PHStoreContext.Provider value={props.store}>
      {props.children}
    </PHStoreContext.Provider>
  );
}

export function usePHStore() {
  return useContext(PHStoreContext);
}
