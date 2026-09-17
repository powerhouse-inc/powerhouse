import type { WorkflowWorkflowOperations } from "document-models/workflow/v1";

export const workflowWorkflowOperations: WorkflowWorkflowOperations = {
  setWorkflowNameOperation(state, action) {
    state.name = action.input.name;
  },
  setWorkflowDescriptionOperation(state, action) {
    state.description = action.input.description || null;
  },
  setWorkflowStatusOperation(state, action) {
    state.status = action.input.status;
  },
};
