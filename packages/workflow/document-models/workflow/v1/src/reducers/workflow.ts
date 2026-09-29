import type { WorkflowWorkflowOperations } from "document-models/workflow/v1";
import { WorkflowNotPublishedError } from "../../gen/workflow/error.js";

export const workflowWorkflowOperations: WorkflowWorkflowOperations = {
  setWorkflowNameOperation(state, action) {
    state.name = action.input.name;
  },
  setWorkflowDescriptionOperation(state, action) {
    state.description = action.input.description || null;
  },
  setWorkflowStatusOperation(state, action) {
    // Runs execute the published snapshot, so there must be one to run.
    if (action.input.status === "ENABLED" && !state.published) {
      throw new WorkflowNotPublishedError(
        "Publish the workflow before enabling it",
      );
    }
    state.status = action.input.status;
  },
};
