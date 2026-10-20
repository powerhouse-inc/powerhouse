import type { PHStore } from "@powerhousedao/reactor-browser";
import {
  bindPHStoreToWindow,
  createPHStore,
  getActivePHStore,
} from "@powerhousedao/reactor-browser";

/** The app's PH store: the active one, else a new one bound to `window.ph`.
 * Values set on `window.ph` before carry over. */
export function getConnectPHStore(): PHStore {
  const active = getActivePHStore();
  if (active) return active;
  const store = createPHStore();
  bindPHStoreToWindow(store);
  return store;
}
