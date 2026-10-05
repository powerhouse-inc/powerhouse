/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type { ClearTriggerInput, SetTriggerInput } from "../types.js";

export type SetTriggerAction = Action & {
  type: "SET_TRIGGER";
  input: SetTriggerInput;
};
export type ClearTriggerAction = Action & {
  type: "CLEAR_TRIGGER";
  input: ClearTriggerInput;
};

export type WorkflowTriggerAction = SetTriggerAction | ClearTriggerAction;
