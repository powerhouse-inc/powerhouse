/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  ClearCoreJobInput,
  SetCoreJobInput,
  UpdateCoreJobInput,
} from "../types.js";

export type SetCoreJobAction = Action & {
  type: "SET_CORE_JOB";
  input: SetCoreJobInput;
};
export type UpdateCoreJobAction = Action & {
  type: "UPDATE_CORE_JOB";
  input: UpdateCoreJobInput;
};
export type ClearCoreJobAction = Action & {
  type: "CLEAR_CORE_JOB";
  input: ClearCoreJobInput;
};

export type ProblemSheetCoreJobAction =
  | SetCoreJobAction
  | UpdateCoreJobAction
  | ClearCoreJobAction;
