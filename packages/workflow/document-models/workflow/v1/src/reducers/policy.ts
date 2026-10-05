import type { WorkflowPolicyOperations } from "document-models/workflow/v1";

export const workflowPolicyOperations: WorkflowPolicyOperations = {
  setPolicyOperation(state, action) {
    if (action.input.concurrency)
      state.policy.concurrency = action.input.concurrency;
    if (
      action.input.maxParallelRuns !== undefined &&
      action.input.maxParallelRuns !== null
    ) {
      state.policy.maxParallelRuns = action.input.maxParallelRuns;
    }
    if (
      action.input.runTimeoutSeconds !== undefined &&
      action.input.runTimeoutSeconds !== null
    ) {
      state.policy.runTimeoutSeconds = action.input.runTimeoutSeconds;
    }
    if (
      action.input.maxSuspensionDays !== undefined &&
      action.input.maxSuspensionDays !== null
    ) {
      state.policy.maxSuspensionDays = action.input.maxSuspensionDays;
    }
    if (action.input.defaultRetry)
      state.policy.defaultRetry = action.input.defaultRetry;
    if (action.input.onFailure) state.policy.onFailure = action.input.onFailure;
    if (
      action.input.retainRunsDays !== undefined &&
      action.input.retainRunsDays !== null
    ) {
      state.policy.retainRunsDays = action.input.retainRunsDays;
    }
    if (
      action.input.journalAsDocument !== undefined &&
      action.input.journalAsDocument !== null
    ) {
      state.policy.journalAsDocument = action.input.journalAsDocument;
    }
    state.version += 1;
  },
};
