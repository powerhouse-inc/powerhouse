/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddStepInput,
  RemoveStepInput,
  SetStepConfigInput,
  UpdateStepInput,
} from "../types.js";

export type AddStepAction = Action & { type: "ADD_STEP"; input: AddStepInput };
export type UpdateStepAction = Action & {
  type: "UPDATE_STEP";
  input: UpdateStepInput;
};
export type RemoveStepAction = Action & {
  type: "REMOVE_STEP";
  input: RemoveStepInput;
};
export type SetStepConfigAction = Action & {
  type: "SET_STEP_CONFIG";
  input: SetStepConfigInput;
};

export type WorkflowStepsAction =
  | AddStepAction
  | UpdateStepAction
  | RemoveStepAction
  | SetStepConfigAction;
