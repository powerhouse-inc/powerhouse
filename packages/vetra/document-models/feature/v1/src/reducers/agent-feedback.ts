import type { FeatureAgentFeedbackOperations } from "document-models/feature/v1";
import {
  DuplicateSuggestionIdError,
  SuggestionAlreadyResolvedError,
  SuggestionNotFoundError,
} from "../../gen/agent-feedback/error.js";

export const featureAgentFeedbackOperations: FeatureAgentFeedbackOperations = {
  setReadyForFeedbackOperation(state, action) {
    state.agentFeedback.readyForFeedback = action.input.ready;
  },
  addSuggestionOperation(state, action) {
    if (state.agentFeedback.suggestions.some((s) => s.id === action.input.id)) {
      throw new DuplicateSuggestionIdError(
        `Suggestion ${action.input.id} already exists.`,
      );
    }
    state.agentFeedback.suggestions.push({
      id: action.input.id,
      createdAt: action.input.createdAt,
      agent: action.input.agent,
      content: action.input.content,
      resolution: null,
    });
  },
  resolveSuggestionOperation(state, action) {
    const suggestion = state.agentFeedback.suggestions.find(
      (s) => s.id === action.input.id,
    );
    if (!suggestion) {
      throw new SuggestionNotFoundError(
        `Suggestion ${action.input.id} not found.`,
      );
    }
    if (suggestion.resolution) {
      throw new SuggestionAlreadyResolvedError(
        `Suggestion ${action.input.id} is already resolved.`,
      );
    }
    suggestion.resolution = {
      resolvedAt: action.input.resolvedAt,
      decision: action.input.decision,
      comment: action.input.comment ?? null,
      changeApplied: action.input.changeApplied,
    };
  },
  removeSuggestionOperation(state, action) {
    const index = state.agentFeedback.suggestions.findIndex(
      (s) => s.id === action.input.id,
    );
    if (index === -1) {
      throw new SuggestionNotFoundError(
        `Suggestion ${action.input.id} not found.`,
      );
    }
    state.agentFeedback.suggestions.splice(index, 1);
  },
};
