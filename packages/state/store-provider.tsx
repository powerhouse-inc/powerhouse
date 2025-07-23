import { Provider } from "jotai";
import "jotai-devtools/styles.css";
import { type ReactNode } from "react";
import { atomStore } from "./store.js";

/** Provides the atom store to the app.
 *
 * This is the top-level provider for the atom store.
 *
 * It is used to provide the atom store to the app.
 *
 * It should only be used once in the app and must appear before any `<Suspense>` boundaries.
 *
 * Includes the Jotai DevTools for debugging.
 */
export function AtomStoreProvider({ children }: { children: ReactNode }) {
  return <Provider store={atomStore}>{children}</Provider>;
}
