/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  SetWorkflowDescriptionInput,
  SetWorkflowNameInput,
  SetWorkflowStatusInput,
} from "../types.js";

export type SetWorkflowNameAction = Action & {
  type: "SET_WORKFLOW_NAME";
  input: SetWorkflowNameInput;
};
export type SetWorkflowDescriptionAction = Action & {
  type: "SET_WORKFLOW_DESCRIPTION";
  input: SetWorkflowDescriptionInput;
};
export type SetWorkflowStatusAction = Action & {
  type: "SET_WORKFLOW_STATUS";
  input: SetWorkflowStatusInput;
};

export type WorkflowWorkflowAction =
  | SetWorkflowNameAction
  | SetWorkflowDescriptionAction
  | SetWorkflowStatusAction;
