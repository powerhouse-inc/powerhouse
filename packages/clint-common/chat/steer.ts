/**
 * Steering: a user message sent while the agent's turn for that chat session
 * is still running reaches the running turn at its next step, instead of
 * waiting for the turn to end.
 *
 * - The watcher marks the message picked up and queues it here (enqueueSteer),
 *   keyed by the session's agent thread id.
 * - The steer processor (createSteerProcessor), registered as a Mastra input
 *   processor, drains the queue before every step of the turn whose
 *   `requestContext.get('clint.threadId')` matches, and appends each message
 *   as a user message.
 * - Steers still queued when the turn ends run as the next turn (the watcher
 *   drains them; nothing is dropped).
 *
 * State is process-local: the queue lives in the process that runs the turn.
 */

export interface SteerMessage {
  id: string;
  text: string;
}

/** RequestContext key carrying the chat session's agent thread id (set by clint's Mastra wrapper). */
export const STEER_THREAD_KEY = "clint.threadId";

/** Prefix of every steer injected into a running turn. */
export const STEER_PREFIX =
  "Steering from the customer (apply now, confirm in one line): ";

const queues = new Map<string, SteerMessage[]>();
const activeTurns = new Map<string, number>();
/** Ids of steers the processor handed to the running turn, per thread; cleared when the thread's turn ends. */
const delivered = new Map<string, Set<string>>();

/** True when the steer processor has handed this message to the turn running on a thread. */
export function isSteerDelivered(messageId: string): boolean {
  for (const ids of delivered.values()) if (ids.has(messageId)) return true;
  return false;
}

/** Queue a message for the running turn on `threadId`. Idempotent per message id. */
export function enqueueSteer(threadId: string, message: SteerMessage): void {
  const queue = queues.get(threadId) ?? [];
  if (queue.some((m) => m.id === message.id)) return;
  queue.push({ id: message.id, text: message.text });
  queues.set(threadId, queue);
}

/** Remove and return every queued message for `threadId`, oldest first. */
export function drainSteers(threadId: string): SteerMessage[] {
  const queue = queues.get(threadId);
  queues.delete(threadId);
  return queue ?? [];
}

/** Mark a turn on `threadId` as running (balanced by endSteerableTurn). */
export function beginSteerableTurn(threadId: string): void {
  activeTurns.set(threadId, (activeTurns.get(threadId) ?? 0) + 1);
}

/** Mark a turn on `threadId` as ended. */
export function endSteerableTurn(threadId: string): void {
  const count = (activeTurns.get(threadId) ?? 0) - 1;
  if (count > 0) activeTurns.set(threadId, count);
  else {
    activeTurns.delete(threadId);
    delivered.delete(threadId);
  }
}

/** True while an agent turn for `threadId` is running in this process. */
export function hasInFlightTurn(threadId: string): boolean {
  return (activeTurns.get(threadId) ?? 0) > 0;
}

/** The user message text a steer carries into the running turn. */
export function steerPrompt(text: string): string {
  return `${STEER_PREFIX}${text}`;
}

/**
 * The subset of Mastra's `ProcessInputStepArgs` the steer processor uses.
 * Declared structurally so clint-common does not depend on `@mastra/core`;
 * a Mastra `ProcessInputStepArgs` is assignable to it.
 */
export interface SteerProcessInputStepArgs {
  requestContext?: { get(key: string): unknown };
  messageList: {
    add(message: { role: "user"; content: string }, source: "input"): unknown;
    markResponseMessageBoundary?(): unknown;
  };
  rotateResponseMessageId?: () => string;
}

/** A Mastra input processor (structurally compatible with `Processor`). */
export interface SteerProcessor {
  readonly id: "clint-steer";
  readonly name: string;
  processInputStep(args: SteerProcessInputStepArgs): void;
}

/**
 * Mastra input processor that injects queued steers into the running turn
 * before each step. Turns without a `clint.threadId` are left untouched.
 */
export function createSteerProcessor(): SteerProcessor {
  return {
    id: "clint-steer",
    name: "Steer",
    processInputStep({ requestContext, messageList, rotateResponseMessageId }) {
      const threadId = requestContext?.get(STEER_THREAD_KEY);
      if (typeof threadId !== "string" || !threadId) return;
      const steers = drainSteers(threadId);
      if (steers.length === 0) return;
      // Close the current response message so this step's output is stored
      // after the steer, not merged into the reply that came before it.
      if (rotateResponseMessageId) {
        messageList.markResponseMessageBoundary?.();
        rotateResponseMessageId();
      }
      const ids = delivered.get(threadId) ?? new Set<string>();
      delivered.set(threadId, ids);
      for (const steer of steers) {
        messageList.add(
          { role: "user", content: steerPrompt(steer.text) },
          "input",
        );
        ids.add(steer.id);
      }
    },
  };
}
