import { useSyncExternalStore } from "react";
import { subscribeToReactor } from "../events/index.js";
import { type Reactor } from "../types/reactor.js";

export function useReactor(): Reactor | undefined {
  const reactor = useSyncExternalStore(
    subscribeToReactor,
    () => window.reactor,
  );
  return reactor;
}
