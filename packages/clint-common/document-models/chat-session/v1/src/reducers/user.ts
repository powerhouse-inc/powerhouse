import type { ChatSessionUserOperations } from "document-models/chat-session/v1";
import {
  InvalidContentPartError,
  MessageNotFoundError,
  NotUserMessageError,
  SessionNotResumableError,
} from "../../gen/user/error.js";

export const chatSessionUserOperations: ChatSessionUserOperations = {
  addUserMessageOperation(state, action) {
    // interruptRequested resets only here and in RETRY_TURN: a set flag
    // tombstones a stopped turn until the next user message or retry.
    state.interruptRequested = false;
    // A new user message supersedes any pending retry request.
    state.retryRequestedFor = null;
    state.retryRequestedAt = null;
    for (const p of action.input.content) {
      if (p.type === "TEXT" && !p.text) {
        throw new InvalidContentPartError("TEXT part requires text");
      }
    }
    const parts = action.input.content.map((p) => ({
      id: p.id,
      type: p.type,
      text: p.text ?? null,
      toolCallId: null,
      toolName: null,
      args: null,
      result: null,
      isError: null,
      mediaType: p.mediaType ?? null,
      url: p.url ?? null,
      attachment: p.attachment ?? null,
      filename: p.filename ?? null,
      error: null,
    }));
    state.messages.push({
      id: action.input.id,
      role: "USER",
      content: parts,
      stepIndex: null,
      createdAt: action.input.createdAt,
      usage: null,
      finishedAt: null,
      finishReason: null,
      pickedUpAt: null,
      failure: null,
    });
    if (state.usage) state.usage.totalMessages += 1;
  },
  deleteUserMessageOperation(state, action) {
    const idx = state.messages.findIndex(
      (m) => m.id === action.input.messageId,
    );
    if (idx === -1)
      throw new MessageNotFoundError(
        "Message not found: " + action.input.messageId,
      );
    if (state.messages[idx].role !== "USER")
      throw new NotUserMessageError("Can only delete USER messages");
    state.messages.splice(idx, 1);
    if (state.usage) state.usage.totalMessages -= 1;
  },
  abortSessionOperation(state, action) {
    state.status = "ABORTED";
    state.endedAt = action.input.endedAt;
  },
  interruptAgentOperation(state) {
    state.interruptRequested = true;
  },
  retryTurnOperation(state, action) {
    const msg = state.messages.find((m) => m.id === action.input.userMessageId);
    if (!msg)
      throw new MessageNotFoundError(
        "Message not found: " + action.input.userMessageId,
      );
    if (msg.role !== "USER")
      throw new NotUserMessageError(
        "Can only retry the turn of a USER message",
      );
    // A retry starts a turn like a new user message, so it clears a stale interrupt.
    state.interruptRequested = false;
    state.retryRequestedFor = action.input.userMessageId;
    state.retryRequestedAt = action.input.requestedAt;
  },
  resumeSessionOperation(state) {
    if (state.status !== "ERROR")
      throw new SessionNotResumableError(
        "Only ERROR sessions can be resumed (status: " + state.status + ")",
      );
    state.status = "ACTIVE";
    state.endedAt = null;
  },
};
