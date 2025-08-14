import { useSyncExternalStore } from "react";
import { subscribeToRenown } from "../internal/events.js";

export function useRenown() {
  const renown = useSyncExternalStore(subscribeToRenown, () => window.renown);
  return renown;
}
