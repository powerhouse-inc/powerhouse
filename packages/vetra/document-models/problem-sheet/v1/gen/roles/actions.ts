/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddRoleInput,
  AddSpecializedJobStepInput,
  ClearRoleSpecializedJobInput,
  RemoveRoleInput,
  RemoveSpecializedJobStepInput,
  ReorderRolesInput,
  ReorderSpecializedJobStepsInput,
  SetRoleSpecializedJobInput,
  UpdateRoleInput,
  UpdateRoleSpecializedJobInput,
  UpdateSpecializedJobStepInput,
} from "../types.js";

export type AddRoleAction = Action & { type: "ADD_ROLE"; input: AddRoleInput };
export type UpdateRoleAction = Action & {
  type: "UPDATE_ROLE";
  input: UpdateRoleInput;
};
export type RemoveRoleAction = Action & {
  type: "REMOVE_ROLE";
  input: RemoveRoleInput;
};
export type ReorderRolesAction = Action & {
  type: "REORDER_ROLES";
  input: ReorderRolesInput;
};
export type SetRoleSpecializedJobAction = Action & {
  type: "SET_ROLE_SPECIALIZED_JOB";
  input: SetRoleSpecializedJobInput;
};
export type UpdateRoleSpecializedJobAction = Action & {
  type: "UPDATE_ROLE_SPECIALIZED_JOB";
  input: UpdateRoleSpecializedJobInput;
};
export type ClearRoleSpecializedJobAction = Action & {
  type: "CLEAR_ROLE_SPECIALIZED_JOB";
  input: ClearRoleSpecializedJobInput;
};
export type AddSpecializedJobStepAction = Action & {
  type: "ADD_SPECIALIZED_JOB_STEP";
  input: AddSpecializedJobStepInput;
};
export type UpdateSpecializedJobStepAction = Action & {
  type: "UPDATE_SPECIALIZED_JOB_STEP";
  input: UpdateSpecializedJobStepInput;
};
export type RemoveSpecializedJobStepAction = Action & {
  type: "REMOVE_SPECIALIZED_JOB_STEP";
  input: RemoveSpecializedJobStepInput;
};
export type ReorderSpecializedJobStepsAction = Action & {
  type: "REORDER_SPECIALIZED_JOB_STEPS";
  input: ReorderSpecializedJobStepsInput;
};

export type ProblemSheetRolesAction =
  | AddRoleAction
  | UpdateRoleAction
  | RemoveRoleAction
  | ReorderRolesAction
  | SetRoleSpecializedJobAction
  | UpdateRoleSpecializedJobAction
  | ClearRoleSpecializedJobAction
  | AddSpecializedJobStepAction
  | UpdateSpecializedJobStepAction
  | RemoveSpecializedJobStepAction
  | ReorderSpecializedJobStepsAction;
