import type { WorkflowPublishingOperations } from "document-models/workflow/v1";
import { NothingPublishedError } from "../../gen/publishing/error.js";
import { cloneJson } from "../helpers.js";

export const workflowPublishingOperations: WorkflowPublishingOperations = {
  publishWorkflowOperation(state, action) {
    state.published = cloneJson({
      version: state.version,
      publishedAt: action.input.publishedAt,
      trigger: state.trigger,
      steps: state.steps,
      edges: state.edges,
      variables: state.variables,
      policy: state.policy,
    });
  },
  revertToPublishedOperation(state, _action) {
    if (!state.published) {
      throw new NothingPublishedError("Workflow has never been published");
    }
    const snapshot = cloneJson(state.published);
    state.trigger = snapshot.trigger;
    state.steps = snapshot.steps;
    state.edges = snapshot.edges;
    state.variables = snapshot.variables;
    state.policy = snapshot.policy;
    state.version = snapshot.version;
  },
};
