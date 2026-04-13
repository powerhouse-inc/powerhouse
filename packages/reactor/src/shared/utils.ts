import type { ViewFilter } from "./types.js";

export function matchesScope(view: ViewFilter = {}, scope: string): boolean {
  if (view.scopes) {
    return view.scopes.includes(scope);
  }

  // if there are no scopes specified, we match all scopes
  return true;
}

export function yieldToMain(): Promise<void> {
  const s = (globalThis as Record<string, unknown>).scheduler as
    | { yield?: () => Promise<void> }
    | undefined;
  if (s?.yield) {
    return s.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}
