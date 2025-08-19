import { useSyncExternalStore } from "react";
import { subscribeToRenown } from "../events/index.js";

export function useRenown() {
  const renown = useSyncExternalStore(subscribeToRenown, () => window.renown);
  return renown;
}
