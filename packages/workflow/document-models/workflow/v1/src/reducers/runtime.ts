import type { WorkflowRuntimeOperations } from "document-models/workflow/v1";

export const workflowRuntimeOperations: WorkflowRuntimeOperations = {
  setLastRunOperation(state, action) {
    state.lastRunAt = action.input.lastRunAt;
    state.lastRunStatus = action.input.lastRunStatus;
  },
};
