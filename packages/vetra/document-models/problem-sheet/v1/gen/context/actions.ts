/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type { ClearContextInput, SetContextInput } from "../types.js";

export type SetContextAction = Action & {
  type: "SET_CONTEXT";
  input: SetContextInput;
};
export type ClearContextAction = Action & {
  type: "CLEAR_CONTEXT";
  input: ClearContextInput;
};

export type ProblemSheetContextAction = SetContextAction | ClearContextAction;
