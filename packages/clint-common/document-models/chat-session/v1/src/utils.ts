import type { Message } from "../gen/types.js";

/**
 * A user message has content when it carries text or an attachment part.
 * Shared by the watcher's skip guard and the editor's responding derivation
 * so both agree on which messages start a turn.
 */
export function hasMessageContent(message: Pick<Message, "content">): boolean {
  return message.content.some(
    (p) =>
      (p.type === "TEXT" && !!p.text) ||
      p.type === "IMAGE" ||
      p.type === "FILE",
  );
}

/**
 * An ASSISTANT message written by FAIL_TURN: the turn for the preceding user
 * message ended with an error. The editor uses it to stop the responding
 * indicator and offer Retry; the watcher uses it to treat the turn as done.
 * Messages from documents created before `failure` existed read as not failed.
 */
export function isFailedTurn(
  message: Pick<Message, "role"> & { failure?: Message["failure"] },
): boolean {
  return message.role === "ASSISTANT" && !!message.failure;
}
