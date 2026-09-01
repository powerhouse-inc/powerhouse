import type { WorkflowEdgesOperations } from "document-models/workflow/v1";
import {
  DuplicateEdgeIdError,
  EdgeNotFoundError,
  EdgeSourceNotFoundError,
  EdgeTargetNotFoundError,
} from "../../gen/edges/error.js";

export const workflowEdgesOperations: WorkflowEdgesOperations = {
  addEdgeOperation(state, action) {
    if (state.edges.some((edge) => edge.id === action.input.id)) {
      throw new DuplicateEdgeIdError("An edge with this id already exists");
    }
    const fromExists =
      state.steps.some((step) => step.id === action.input.from) ||
      state.trigger?.id === action.input.from;
    if (!fromExists) {
      throw new EdgeSourceNotFoundError(
        "Edge source step or trigger not found",
      );
    }
    if (!state.steps.some((step) => step.id === action.input.to)) {
      throw new EdgeTargetNotFoundError("Edge target step not found");
    }
    state.edges.push({
      id: action.input.id,
      from: action.input.from,
      to: action.input.to,
      port: action.input.port,
      condition: action.input.condition || null,
    });
    state.version += 1;
  },
  removeEdgeOperation(state, action) {
    const index = state.edges.findIndex((edge) => edge.id === action.input.id);
    if (index === -1) {
      throw new EdgeNotFoundError("Edge not found");
    }
    state.edges.splice(index, 1);
    state.version += 1;
  },
};
