// Activepieces' sub-flow piece: Call Flow calls a workflow whose trigger is
// Callable Flow.
export const SUBFLOWS_PIECE = "@activepieces/piece-subflows";
export const CALLABLE_FLOW_TRIGGER = "callableFlow";
export const CALL_FLOW_ACTION = "callFlow";

// A trigger binding (packageName) or a definition's trigger (pieceName).
export function isCallableFlow(trigger: {
  pieceName?: string;
  packageName?: string;
  triggerName?: string;
}): boolean {
  return (
    (trigger.packageName ?? trigger.pieceName) === SUBFLOWS_PIECE &&
    trigger.triggerName === CALLABLE_FLOW_TRIGGER
  );
}
