import type { Reactor } from "@powerhousedao/reactor-browser";
import { subscribeToReactor } from "@powerhousedao/reactor-browser";
import { useSyncExternalStore } from "react";

export function useReactor(): Reactor | undefined {
  const reactor = useSyncExternalStore(
    subscribeToReactor,
    () => window.reactor,
  );
  return reactor;
}
