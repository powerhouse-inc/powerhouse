import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  initialOptimisticStopState,
  optimisticStopReducer,
  selectStopStatus,
  OPTIMISTIC_STOP_TIMEOUT_MS,
  INTERRUPTING_TIMEOUT_MS,
  type StopStatus,
} from "./optimistic-stop-machine.js";

export {
  OPTIMISTIC_STOP_TIMEOUT_MS,
  INTERRUPTING_TIMEOUT_MS,
} from "./optimistic-stop-machine.js";
export type { StopStatus } from "./optimistic-stop-machine.js";

type UseOptimisticStopOptions = {
  /** Server-owned working signal (chat-session `responding`). */
  responding: boolean;
  /** Override the optimistic revert timeout. */
  timeoutMs?: number;
  /** Override the interrupting fallback timeout. */
  interruptingTimeoutMs?: number;
};

type UseOptimisticStopResult = {
  status: StopStatus;
  /** Call the moment a user message is dispatched: arms the optimistic
   *  stop + revert timeout. */
  markSubmitted: () => void;
  /** Call when the user clicks stop: enters the sticky `interrupting` state.
   *  Resolves to idle only when the turn actually ends (`responding=false`)
   *  or the fallback timeout fires. No-op once already interrupting. */
  requestInterrupt: () => void;
};

/**
 * State machine for the optimistic stop button (see optimistic-stop-machine):
 *   idle (send) → markSubmitted() → submitted (stop, timeout armed)
 *     → responding=true       → streaming (stop, server-owned)
 *     → responding=false      → idle (turn ended without a click)
 *     → timeout (no click)    → idle (turn never started)
 *   submitted | streaming → requestInterrupt() → interrupting (sticky)
 *     → absorbs late responding=true (stays interrupting)
 *     → responding=false      → idle (turn aborted/ended)
 *     → fallback timeout       → idle (turn never started)
 */
export function useOptimisticStop({
  responding,
  timeoutMs = OPTIMISTIC_STOP_TIMEOUT_MS,
  interruptingTimeoutMs = INTERRUPTING_TIMEOUT_MS,
}: UseOptimisticStopOptions): UseOptimisticStopResult {
  const [state, dispatch] = useReducer(
    optimisticStopReducer,
    initialOptimisticStopState,
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the previous `responding` so interrupting resolves on the real
  // true→false edge, not on a `responding` that was already false when the
  // user clicked stop during the optimistic window (that case is the fallback
  // timeout's job).
  const prevRespondingRef = useRef(responding);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const requestInterrupt = useCallback(() => {
    if (state.interrupting) return;
    clearTimer();
    dispatch({ type: "interrupt" });
    // Fallback so the button can't get stuck if the turn never started and
    // `responding` therefore never toggles.
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      dispatch({ type: "resolve" });
    }, interruptingTimeoutMs);
  }, [state.interrupting, clearTimer, interruptingTimeoutMs]);

  const markSubmitted = useCallback(() => {
    clearTimer();
    dispatch({ type: "submit" });
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      dispatch({ type: "timeout" });
    }, timeoutMs);
  }, [clearTimer, timeoutMs]);

  // Once the server confirms the turn, the working state is owned by
  // `responding`; drop the optimistic flag and cancel the revert timeout.
  // While interrupting this is a no-op in the reducer (late confirm absorbed).
  useEffect(() => {
    if (responding && state.optimistic && !state.interrupting) {
      clearTimer();
      dispatch({ type: "confirmed" });
    }
  }, [responding, state.optimistic, state.interrupting, clearTimer]);

  // The real end-of-turn signal (responding true→false) resolves interrupting
  // back to idle. A `responding` that is already false when interrupting
  // begins is not an end-of-turn edge — the fallback timeout covers the
  // never-started case so a late true→false can still be awaited.
  useEffect(() => {
    const fellToFalse = prevRespondingRef.current && !responding;
    prevRespondingRef.current = responding;
    if (state.interrupting && fellToFalse) {
      clearTimer();
      dispatch({ type: "resolve" });
    }
  }, [state.interrupting, responding, clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  return {
    status: selectStopStatus(state, responding),
    markSubmitted,
    requestInterrupt,
  };
}
