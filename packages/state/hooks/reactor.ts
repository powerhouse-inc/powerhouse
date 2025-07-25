import { type Reactor } from "../internal/types.js";

/** Returns the reactor. */
export function useReactor(): Reactor | undefined {
  return window.reactor;
}
