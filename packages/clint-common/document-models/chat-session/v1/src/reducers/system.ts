import type { ChatSessionSystemOperations } from "document-models/chat-session/v1";

export const chatSessionSystemOperations: ChatSessionSystemOperations = {
  startSessionOperation(state, action) {
    state.threadId = action.input.threadId;
    state.resourceId = action.input.resourceId;
    state.agent = {
      id: action.input.agent.id ?? null,
      name: action.input.agent.name ?? null,
      model: action.input.agent.model ?? null,
      description: action.input.agent.description ?? null,
      attachment: null,
    };
    state.status = "ACTIVE";
    state.startedAt = action.input.startedAt;
    state.usage = {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      totalSteps: 0,
      totalMessages: 0,
      totalToolCalls: 0,
    };
    state.retryRequestedFor = null;
    state.retryRequestedAt = null;
  },
  endSessionOperation(state, action) {
    state.status = action.input.status;
    state.endedAt = action.input.endedAt;
  },
  setAgentInfoOperation(state, action) {
    if (!state.agent) {
      state.agent = {
        id: null,
        name: null,
        model: null,
        description: null,
        attachment: null,
      };
    }
    if (action.input.id) state.agent.id = action.input.id;
    if (action.input.name) state.agent.name = action.input.name;
    if (action.input.model) state.agent.model = action.input.model;
    if (action.input.description)
      state.agent.description = action.input.description;
  },
  addSystemMessageOperation(state, action) {
    state.messages.push({
      id: action.input.id,
      role: "SYSTEM",
      content: [
        {
          id: action.input.id + "-text",
          type: "TEXT",
          text: action.input.text,
          toolCallId: null,
          toolName: null,
          args: null,
          result: null,
          isError: null,
          mediaType: null,
          url: null,
          attachment: null,
          filename: null,
          error: null,
        },
      ],
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
  updateUsageSummaryOperation(state, action) {
    if (!state.usage) {
      state.usage = {
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        totalSteps: 0,
        totalMessages: 0,
        totalToolCalls: 0,
      };
    }
    if (
      action.input.totalPromptTokens !== undefined &&
      action.input.totalPromptTokens !== null
    )
      state.usage.totalPromptTokens = action.input.totalPromptTokens;
    if (
      action.input.totalCompletionTokens !== undefined &&
      action.input.totalCompletionTokens !== null
    )
      state.usage.totalCompletionTokens = action.input.totalCompletionTokens;
    if (
      action.input.totalTokens !== undefined &&
      action.input.totalTokens !== null
    )
      state.usage.totalTokens = action.input.totalTokens;
    if (
      action.input.totalSteps !== undefined &&
      action.input.totalSteps !== null
    )
      state.usage.totalSteps = action.input.totalSteps;
    if (
      action.input.totalMessages !== undefined &&
      action.input.totalMessages !== null
    )
      state.usage.totalMessages = action.input.totalMessages;
    if (
      action.input.totalToolCalls !== undefined &&
      action.input.totalToolCalls !== null
    )
      state.usage.totalToolCalls = action.input.totalToolCalls;
  },
  setAgentImageOperation(state, action) {
    if (!state.agent) {
      state.agent = {
        id: null,
        name: null,
        model: null,
        description: null,
        attachment: null,
      };
    }
    state.agent.attachment = action.input.attachment ?? null;
  },
  setAgentDescriptionOperation(state, action) {
    if (!state.agent) {
      state.agent = {
        id: null,
        name: null,
        model: null,
        description: null,
        attachment: null,
      };
    }
    state.agent.description = action.input.description;
  },
};
