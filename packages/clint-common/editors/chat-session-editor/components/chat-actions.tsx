import type { TurnFailure } from "document-models/chat-session";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { DeliveryState } from "../lib/turn-state.js";

/** Renders a host-specific action for a failed turn (e.g. "Request more budget"
 *  for BUDGET_EXHAUSTED). Returning null renders nothing. */
export type RenderFailureAction = (failure: TurnFailure) => ReactNode;

export interface ChatActions {
  /** Ask the agent to run the turn of a user message again. */
  onRetry?: (userMessageId: string) => void;
  renderFailureAction?: RenderFailureAction;
  /** The failed-turn message that shows a Retry button. */
  retryableFailureId: string | null;
  /** The message whose delivery state is shown, its state, and when the wait for pickup started. */
  deliveryMessageId: string | null;
  deliveryState: DeliveryState | null;
  deliverySince: string | null;
  /** The session accepts new turns (status ACTIVE). */
  active: boolean;
}

const defaultActions: ChatActions = {
  retryableFailureId: null,
  deliveryMessageId: null,
  deliveryState: null,
  deliverySince: null,
  active: false,
};

const ChatActionsContext = createContext<ChatActions>(defaultActions);

export function ChatActionsProvider({
  value,
  children,
}: {
  value: ChatActions;
  children: ReactNode;
}) {
  return (
    <ChatActionsContext.Provider value={value}>
      {children}
    </ChatActionsContext.Provider>
  );
}

export function useChatActions(): ChatActions {
  return useContext(ChatActionsContext);
}

/** True once `since + ms` has passed; re-renders when the deadline arrives. */
export function useElapsed(
  since: string | null | undefined,
  ms: number,
  enabled: boolean,
): boolean {
  const deadline = since ? Date.parse(since) + ms : NaN;
  const [, setTick] = useState(0);
  const elapsed = enabled && !Number.isNaN(deadline) && Date.now() >= deadline;

  useEffect(() => {
    if (!enabled || Number.isNaN(deadline) || elapsed) return;
    const timer = setTimeout(
      () => setTick((t) => t + 1),
      Math.max(0, deadline - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [enabled, deadline, elapsed]);

  return elapsed;
}

export function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground hover:bg-muted"
    >
      Retry
    </button>
  );
}
