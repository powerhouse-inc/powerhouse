import type { WorkflowRuntimeOperations } from "document-models/workflow/v1";
import { LastTestTargetNotFoundError } from "../../gen/runtime/error.js";
import { findStepOrTrigger } from "../helpers.js";

export const workflowRuntimeOperations: WorkflowRuntimeOperations = {
  setLastRunOperation(state, action) {
    state.lastRunAt = action.input.lastRunAt;
    state.lastRunStatus = action.input.lastRunStatus;
  },
  setLastTestOperation(state, action) {
    const target = findStepOrTrigger(state, action.input.id);
    if (!target) {
      throw new LastTestTargetNotFoundError("Step or trigger not found");
    }
    target.lastTest = {
      runId: action.input.runId,
      testedAt: action.input.testedAt,
    };
  },
};
