import type { WorkflowTriggerOperations } from "document-models/workflow/v1";
import { TriggerNotSetError } from "../../gen/trigger/error.js";

export const workflowTriggerOperations: WorkflowTriggerOperations = {
  setTriggerOperation(state, action) {
    state.trigger = {
      id: action.input.id,
      blockType: action.input.blockType,
      connectionId: action.input.connectionId || null,
      config: action.input.config,
      filter: action.input.filter ?? null,
    };
    state.version += 1;
  },
  clearTriggerOperation(state, _action) {
    if (!state.trigger) {
      throw new TriggerNotSetError("Workflow has no trigger to clear");
    }
    const triggerId = state.trigger.id;
    state.trigger = null;
    state.edges = state.edges.filter((edge) => edge.from !== triggerId);
    state.version += 1;
  },
};
