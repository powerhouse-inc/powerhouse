/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddJobStepInput,
  RemoveJobStepInput,
  ReorderJobStepsInput,
  UpdateJobStepInput,
} from "../types.js";

export type AddJobStepAction = Action & {
  type: "ADD_JOB_STEP";
  input: AddJobStepInput;
};
export type UpdateJobStepAction = Action & {
  type: "UPDATE_JOB_STEP";
  input: UpdateJobStepInput;
};
export type RemoveJobStepAction = Action & {
  type: "REMOVE_JOB_STEP";
  input: RemoveJobStepInput;
};
export type ReorderJobStepsAction = Action & {
  type: "REORDER_JOB_STEPS";
  input: ReorderJobStepsInput;
};

export type ProblemSheetJobStepsAction =
  | AddJobStepAction
  | UpdateJobStepAction
  | RemoveJobStepAction
  | ReorderJobStepsAction;
