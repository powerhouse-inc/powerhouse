import { randomUUID } from "node:crypto";
import type { AuthStore } from "./auth-store.js";

// Carry a live AuthStore to the plugin as a token (verdaccio merges the app
// config's `store` block into plugin configs), tracking whether it loaded.
const REGISTRY_KEY = Symbol.for("@powerhousedao/registry:auth-store-handoff");

interface Entry {
  store: AuthStore;
  loaded: boolean;
}

function registry(): Map<string, Entry> {
  const g = globalThis as { [REGISTRY_KEY]?: Map<string, Entry> };
  return (g[REGISTRY_KEY] ??= new Map<string, Entry>());
}

/** Stash a store instance and return a token to carry through plugin config. */
export function stashAuthStore(store: AuthStore): string {
  const token = randomUUID();
  registry().set(token, { store, loaded: false });
  return token;
}

/** Resolve a stashed store by token (undefined if unknown). */
export function takeAuthStore(token: string): AuthStore | undefined {
  return registry().get(token)?.store;
}

/** Record that the plugin fully constructed with this token's store. */
export function markStoreLoaded(token: string): void {
  const entry = registry().get(token);
  if (entry) entry.loaded = true;
}

/** True once the plugin has loaded the store for this token. */
export function wasStoreLoaded(token: string): boolean {
  return registry().get(token)?.loaded ?? false;
}
