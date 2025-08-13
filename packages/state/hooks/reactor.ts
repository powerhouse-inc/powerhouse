import { useSyncExternalStore } from "react";
import { subscribeToReactor } from "../internal/events.js";
import { type Reactor } from "../internal/types.js";

export function useReactor(): Reactor | undefined {
  const reactor = useSyncExternalStore(
    subscribeToReactor,
    () => window.reactor,
  );
  return reactor;
}
