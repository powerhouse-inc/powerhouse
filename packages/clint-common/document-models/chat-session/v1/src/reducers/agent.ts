import type { ChatSessionAgentOperations } from "document-models/chat-session/v1";
import {
  ContentPartNotFoundError,
  InvalidContentPartError,
  MessageNotFoundError,
  NotAssistantMessageError,
} from "../../gen/agent/error.js";

export const chatSessionAgentOperations: ChatSessionAgentOperations = {
  addAssistantMessageOperation(state, action) {
    for (const p of action.input.content) {
      if ((p.type === "TEXT" || p.type === "REASONING") && !p.text) {
        throw new InvalidContentPartError(p.type + " part requires text");
      }
      if (p.type === "TOOL_CALL") {
        if (!p.toolCallId)
          throw new InvalidContentPartError(
            "TOOL_CALL part requires toolCallId",
          );
        if (!p.toolName)
          throw new InvalidContentPartError("TOOL_CALL part requires toolName");
      }
      if (p.type === "ERROR" && !p.error) {
        throw new InvalidContentPartError("ERROR part requires error field");
      }
    }
    const parts = action.input.content.map((p) => ({
      id: p.id,
      type: p.type,
      text: p.text ?? null,
      toolCallId: p.toolCallId ?? null,
      toolName: p.toolName ?? null,
      args: p.args ?? null,
      result: null,
      isError: null,
      mediaType: p.mediaType ?? null,
      url: p.url ?? null,
      attachment: p.attachment ?? null,
      filename: p.filename ?? null,
      error: p.error ?? null,
    }));
    state.messages.push({
      id: action.input.id,
      role: "ASSISTANT",
      content: parts,
      stepIndex: action.input.stepIndex ?? null,
      createdAt: action.input.createdAt,
      usage: null,
      finishedAt: null,
      finishReason: null,
      pickedUpAt: null,
      failure: null,
    });
    if (state.usage) {
      state.usage.totalMessages += 1;
      const toolCalls = parts.filter((p) => p.type === "TOOL_CALL").length;
      state.usage.totalToolCalls += toolCalls;
    }
  },
  appendAssistantContentOperation(state, action) {
    const msg = state.messages.find((m) => m.id === action.input.messageId);
    if (!msg)
      throw new MessageNotFoundError(
        "Message not found: " + action.input.messageId,
      );
    if (msg.role !== "ASSISTANT")
      throw new NotAssistantMessageError(
        "Can only append to ASSISTANT messages",
      );
    const p = action.input.part;
    if ((p.type === "TEXT" || p.type === "REASONING") && !p.text) {
      throw new InvalidContentPartError(p.type + " part requires text");
    }
    if (p.type === "TOOL_CALL") {
      if (!p.toolCallId)
        throw new InvalidContentPartError("TOOL_CALL part requires toolCallId");
      if (!p.toolName)
        throw new InvalidContentPartError("TOOL_CALL part requires toolName");
    }
    if (p.type === "ERROR" && !p.error) {
      throw new InvalidContentPartError("ERROR part requires error field");
    }
    msg.content.push({
      id: p.id,
      type: p.type,
      text: p.text ?? null,
      toolCallId: p.toolCallId ?? null,
      toolName: p.toolName ?? null,
      args: p.args ?? null,
      result: null,
      isError: null,
      mediaType: p.mediaType ?? null,
      url: p.url ?? null,
      attachment: p.attachment ?? null,
      filename: p.filename ?? null,
      error: p.error ?? null,
    });
    if (state.usage && p.type === "TOOL_CALL") state.usage.totalToolCalls += 1;
  },
  updateAssistantContentOperation(state, action) {
    const msg = state.messages.find((m) => m.id === action.input.messageId);
    if (!msg)
      throw new MessageNotFoundError(
        "Message not found: " + action.input.messageId,
      );
    const part = msg.content.find((p) => p.id === action.input.partId);
    if (!part)
      throw new ContentPartNotFoundError(
        "Content part not found: " + action.input.partId,
      );
    if (action.input.text) part.text = action.input.text;
    if (action.input.args) part.args = action.input.args;
    if (action.input.error) part.error = action.input.error;
  },
  setMessageUsageOperation(state, action) {
    const msg = state.messages.find((m) => m.id === action.input.messageId);
    if (!msg)
      throw new MessageNotFoundError(
        "Message not found: " + action.input.messageId,
      );
    msg.usage = {
      promptTokens: action.input.promptTokens ?? null,
      completionTokens: action.input.completionTokens ?? null,
      totalTokens: action.input.totalTokens ?? null,
    };
  },
  finishAssistantMessageOperation(state, action) {
    const msg = state.messages.find((m) => m.id === action.input.messageId);
    if (!msg)
      throw new MessageNotFoundError(
        "Message not found: " + action.input.messageId,
      );
    msg.finishedAt = action.input.finishedAt;
    msg.finishReason = action.input.finishReason ?? null;
  },
  markMessagePickedUpOperation(state, action) {
    const msg = state.messages.find((m) => m.id === action.input.messageId);
    if (!msg)
      throw new MessageNotFoundError(
        "Message not found: " + action.input.messageId,
      );
    msg.pickedUpAt = action.input.pickedUpAt;
  },
  failTurnOperation(state, action) {
    state.messages.push({
      id: action.input.id,
      role: "ASSISTANT",
      content: [
        {
          id: action.input.id + "-error",
          type: "ERROR",
          text: null,
          toolCallId: null,
          toolName: null,
          args: null,
          result: null,
          isError: null,
          mediaType: null,
          url: null,
          attachment: null,
          filename: null,
          error: action.input.message,
        },
      ],
      stepIndex: null,
      createdAt: action.input.failedAt,
      usage: null,
      finishedAt: action.input.failedAt,
      finishReason: "error",
      pickedUpAt: null,
      failure: {
        userMessageId: action.input.userMessageId,
        code: action.input.code,
        message: action.input.message,
        retryable: action.input.retryable,
        failedAt: action.input.failedAt,
      },
    });
    if (state.usage) state.usage.totalMessages += 1;
  },
  clearRetryRequestOperation(state) {
    state.retryRequestedFor = null;
    state.retryRequestedAt = null;
  },
};
