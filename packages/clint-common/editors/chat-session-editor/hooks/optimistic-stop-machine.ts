/** How long the optimistic stop state waits for the server `responding`
 *  signal before reverting to send. `responding` derives from document state
 *  (last message is a non-empty user message), so it flips once the
 *  dispatched message lands — typically sub-second. 10s is a safe upper
 *  bound that still frees the user from a dead stop button if the message
 *  never lands. */
export const OPTIMISTIC_STOP_TIMEOUT_MS = 10_000;

/** How long `interrupting` waits for `responding=false` before resolving to
 *  idle on its own. Covers the case where stop is clicked in the optimistic
 *  window and the turn never starts, so `responding` never toggles. Bounded
 *  by the same worst-case startup window as the optimistic timeout: if the
 *  turn was going to confirm it would have done so within that window, so by
 *  the time it elapses with no `responding=true` there is nothing to abort. */
export const INTERRUPTING_TIMEOUT_MS = OPTIMISTIC_STOP_TIMEOUT_MS;

/** Button phases.
 *  - `submitted`: optimistic window — turn dispatched, server not yet confirmed.
 *  - `streaming`: confirmed working turn (server `responding=true`).
 *  - `interrupting`: stop requested; sticky until the turn actually ends. */
export type StopStatus = "idle" | "submitted" | "streaming" | "interrupting";

/** Pure machine state: the local optimistic flag and the sticky interrupting
 *  flag. The server-owned `responding` signal is read directly when selecting
 *  the status. */
export type OptimisticStopState = {
  optimistic: boolean;
  interrupting: boolean;
};

export type OptimisticStopEvent =
  /** User dispatched a message — arm the optimistic stop. */
  | { type: "submit" }
  /** Server confirmed the turn — hand off to `responding`, drop optimistic. */
  | { type: "confirmed" }
  /** Optimistic revert timeout fired before confirmation. */
  | { type: "timeout" }
  /** User clicked stop — request the interrupt, become sticky. */
  | { type: "interrupt" }
  /** Interrupt resolved: the turn ended (responding=false) or the fallback
   *  timeout fired. Return to idle. */
  | { type: "resolve" };

export const initialOptimisticStopState: OptimisticStopState = {
  optimistic: false,
  interrupting: false,
};

export function optimisticStopReducer(
  state: OptimisticStopState,
  event: OptimisticStopEvent,
): OptimisticStopState {
  switch (event.type) {
    case "submit":
      return { optimistic: true, interrupting: false };
    case "interrupt":
      // Sticky: ignore once already interrupting.
      return state.interrupting
        ? state
        : { optimistic: false, interrupting: true };
    case "resolve":
      return state.interrupting ? initialOptimisticStopState : state;
    case "confirmed":
    case "timeout":
      // The optimistic flag never matters once interrupting is set.
      if (state.interrupting) return state;
      return state.optimistic ? { ...state, optimistic: false } : state;
  }
}

/** Interrupting is sticky and wins over everything; otherwise server
 *  `responding` wins over the optimistic flag. */
export function selectStopStatus(
  state: OptimisticStopState,
  responding: boolean,
): StopStatus {
  if (state.interrupting) return "interrupting";
  if (responding) return "streaming";
  return state.optimistic ? "submitted" : "idle";
}
