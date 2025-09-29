import { subscribeToRenown } from "@powerhousedao/reactor-browser";
import { useSyncExternalStore } from "react";

export function useRenown() {
  const renown = useSyncExternalStore(subscribeToRenown, () => window.renown);
  return renown;
}
