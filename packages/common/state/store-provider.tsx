import { Provider } from "jotai";
import { DevTools } from "jotai-devtools";
import { type ReactNode } from "react";
import { atomStore } from "./store.js";

export function AtomStoreProvider({ children }: { children: ReactNode }) {
  return (
    <Provider store={atomStore}>
      <DevTools store={atomStore} />
      {children}
    </Provider>
  );
}
