import type { ChatSessionToolOperations } from "document-models/chat-session/v1";
import { MessageNotFoundError } from "../../gen/tool/error.js";

export const chatSessionToolOperations: ChatSessionToolOperations = {
  addToolResultOperation(state, action) {
    const parts = action.input.content.map((p) => ({
      id: p.id,
      type: p.type,
      text: p.text ?? null,
      toolCallId: p.toolCallId,
      toolName: p.toolName,
      args: null,
      result: p.result ?? null,
      isError: p.isError ?? null,
      mediaType: p.mediaType ?? null,
      url: p.url ?? null,
      attachment: p.attachment ?? null,
      filename: null,
      error: null,
    }));
    state.messages.push({
      id: action.input.id,
      role: "TOOL",
      content: parts,
      stepIndex: action.input.stepIndex ?? null,
      createdAt: action.input.createdAt,
      usage: null,
      finishedAt: null,
      finishReason: null,
      pickedUpAt: null,
      failure: null,
    });
    if (state.usage) state.usage.totalMessages += 1;
  },
  addToolOutputOperation(state, action) {
    const msg = state.messages.find((m) => m.id === action.input.messageId);
    if (!msg)
      throw new MessageNotFoundError(
        "Message not found: " + action.input.messageId,
      );
    msg.content.push({
      id: action.input.partId,
      type: "TEXT",
      text: action.input.text,
      toolCallId: action.input.toolCallId,
      toolName: action.input.toolName,
      args: null,
      result: null,
      isError: null,
      mediaType: null,
      url: null,
      attachment: null,
      filename: null,
      error: null,
    });
  },
};
