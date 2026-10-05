/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type { RemoveVariableInput, SetVariableInput } from "../types.js";

export type SetVariableAction = Action & {
  type: "SET_VARIABLE";
  input: SetVariableInput;
};
export type RemoveVariableAction = Action & {
  type: "REMOVE_VARIABLE";
  input: RemoveVariableInput;
};

export type WorkflowVariablesAction = SetVariableAction | RemoveVariableAction;
