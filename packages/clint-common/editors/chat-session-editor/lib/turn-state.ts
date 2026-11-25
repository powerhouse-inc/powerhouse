import { isFailedTurn } from "document-models/chat-session";
import type { ChatSessionState, Message } from "document-models/chat-session";

/** Delivery state of the message the agent should work on next. The editor
 *  cannot see sync, so until the agent picks a message up it is "sending". */
export type DeliveryState = "sending" | "picked-up";

/** Time after which an unpicked message (or retry) is flagged as "Not picked up yet". */
export const NOT_PICKED_UP_AFTER_MS = 60_000;

export interface TurnView {
  /** The agent has picked up the current turn and is working on it
   *  (drives the typing indicator and stop button). */
  responding: boolean;
  /** The message whose delivery state is shown: the pending retry's user
   *  message, else the latest user message. */
  deliveryMessageId: string | null;
  deliveryState: DeliveryState | null;
  /** When the wait for pickup started (the retry request, else the message's createdAt). */
  deliverySince: string | null;
  /** Id of the failed-turn message that can be retried right now: the last
   *  message of the conversation, while nothing is running or pending. */
  retryableFailureId: string | null;
}

type TurnStateInput = Pick<
  ChatSessionState,
  "status" | "interruptRequested" | "messages"
> & {
  /** Undefined on documents created before retries existed. */
  retryRequestedFor?: ChatSessionState["retryRequestedFor"];
  retryRequestedAt?: ChatSessionState["retryRequestedAt"];
};

function isAfter(a: string | null | undefined, b: string): boolean {
  return !!a && Date.parse(a) > Date.parse(b);
}

/** Picked up: pickedUpAt is set, or (legacy documents) a reply follows it. */
function isPickedUp(messages: Message[], index: number): boolean {
  if (messages[index].pickedUpAt) return true;
  return messages
    .slice(index + 1)
    .some((m) => m.role === "ASSISTANT" || m.role === "TOOL");
}

function isResponding(state: TurnStateInput, lastUserIdx: number): boolean {
  const { status, interruptRequested, messages } = state;
  if (status !== "ACTIVE" || interruptRequested) return false;
  if (lastUserIdx === -1) return false;
  // A requested retry is not running until the agent picks it up (it clears the request).
  if (state.retryRequestedFor) return false;
  if (!isPickedUp(messages, lastUserIdx)) return false;

  // Only messages after the latest failed turn count: a failure ends the turn
  // unless the user message was picked up again after it (a retry started).
  let start = lastUserIdx + 1;
  for (let i = messages.length - 1; i > lastUserIdx; i--) {
    const failure = messages[i].failure;
    if (!isFailedTurn(messages[i]) || !failure) continue;
    const userMessage =
      messages.find((m) => m.id === failure.userMessageId) ??
      messages[lastUserIdx];
    if (!isAfter(userMessage.pickedUpAt, failure.failedAt)) return false;
    start = i + 1;
    break;
  }

  for (let i = start; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "ASSISTANT" && m.finishedAt) return false;
  }
  return true;
}

export function deriveTurnView(state: TurnStateInput): TurnView {
  const { messages } = state;
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "USER") {
      lastUserIdx = i;
      break;
    }
  }

  const responding = isResponding(state, lastUserIdx);

  let deliveryMessageId: string | null = null;
  let deliveryState: DeliveryState | null = null;
  let deliverySince: string | null = null;
  const retryIdx = state.retryRequestedFor
    ? messages.findIndex(
        (m) => m.id === state.retryRequestedFor && m.role === "USER",
      )
    : -1;
  if (retryIdx !== -1) {
    const target = messages[retryIdx];
    deliveryMessageId = target.id;
    deliveryState = "sending";
    deliverySince = state.retryRequestedAt ?? target.createdAt;
  } else if (lastUserIdx !== -1) {
    const lastUser = messages[lastUserIdx];
    deliveryMessageId = lastUser.id;
    deliveryState = isPickedUp(messages, lastUserIdx) ? "picked-up" : "sending";
    deliverySince = lastUser.createdAt;
  }

  const lastMessage =
    messages.length > 0 ? messages[messages.length - 1] : undefined;
  const retryableFailureId =
    state.status === "ACTIVE" &&
    !responding &&
    !state.retryRequestedFor &&
    lastMessage &&
    isFailedTurn(lastMessage)
      ? lastMessage.id
      : null;

  return {
    responding,
    deliveryMessageId,
    deliveryState,
    deliverySince,
    retryableFailureId,
  };
}
