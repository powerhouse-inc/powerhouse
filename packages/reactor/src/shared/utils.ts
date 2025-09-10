import type { ViewFilter } from "./types.js";

export function matchesScope(view: ViewFilter = {}, scope: string): boolean {
  if (view.scopes) {
    return view.scopes.includes(scope);
  }

  // if there are no scopes specified, we match all scopes
  return true;
}
