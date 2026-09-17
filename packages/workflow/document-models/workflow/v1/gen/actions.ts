/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { WorkflowEdgesAction } from "./edges/actions.js";
import type { WorkflowPolicyAction } from "./policy/actions.js";
import type { WorkflowRuntimeAction } from "./runtime/actions.js";
import type { WorkflowStepsAction } from "./steps/actions.js";
import type { WorkflowTriggerAction } from "./trigger/actions.js";
import type { WorkflowVariablesAction } from "./variables/actions.js";
import type { WorkflowWorkflowAction } from "./workflow/actions.js";

export * from "./edges/actions.js";
export * from "./policy/actions.js";
export * from "./runtime/actions.js";
export * from "./steps/actions.js";
export * from "./trigger/actions.js";
export * from "./variables/actions.js";
export * from "./workflow/actions.js";

export type WorkflowAction =
  | WorkflowWorkflowAction
  | WorkflowTriggerAction
  | WorkflowStepsAction
  | WorkflowEdgesAction
  | WorkflowVariablesAction
  | WorkflowPolicyAction
  | WorkflowRuntimeAction;
