import { Provider } from "jotai";
import { DevTools } from "jotai-devtools";
import "jotai-devtools/styles.css";
import { type ReactNode } from "react";
import { useInitializeReactor } from "./reactor.js";
import { atomStore } from "./store.js";
import { type Reactor } from "./types.js";

function InitReactor({ reactor }: { reactor: Reactor }) {
  useInitializeReactor(() => Promise.resolve(reactor));

  return null;
}

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
export function AtomStoreProvider({
  reactor,
  children,
}: {
  reactor?: Reactor | undefined;
  children: ReactNode;
}) {
  return (
    <Provider store={atomStore}>
      <DevTools store={atomStore} />
      {reactor && <InitReactor reactor={reactor} />}
      {children}
    </Provider>
  );
}
