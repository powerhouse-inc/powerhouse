/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { baseActions } from "document-model";
import {
  workflowEdgesActions,
  workflowPolicyActions,
  workflowRuntimeActions,
  workflowStepsActions,
  workflowTriggerActions,
  workflowVariablesActions,
  workflowWorkflowActions,
} from "./gen/creators.js";

/** Actions for the Workflow document model */

export const actions = {
  ...baseActions,
  ...workflowWorkflowActions,
  ...workflowTriggerActions,
  ...workflowStepsActions,
  ...workflowEdgesActions,
  ...workflowVariablesActions,
  ...workflowPolicyActions,
  ...workflowRuntimeActions,
};
