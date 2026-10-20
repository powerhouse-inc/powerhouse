import { useRouterState } from "@tanstack/react-router";

/** True until the router has resolved its first location. */
export function useIsColdStart() {
  return useRouterState({ select: (state) => !state.resolvedLocation });
}
