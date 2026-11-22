/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddConstraintInput,
  RemoveConstraintInput,
  ReorderConstraintsInput,
  UpdateConstraintInput,
} from "../types.js";

export type AddConstraintAction = Action & {
  type: "ADD_CONSTRAINT";
  input: AddConstraintInput;
};
export type UpdateConstraintAction = Action & {
  type: "UPDATE_CONSTRAINT";
  input: UpdateConstraintInput;
};
export type RemoveConstraintAction = Action & {
  type: "REMOVE_CONSTRAINT";
  input: RemoveConstraintInput;
};
export type ReorderConstraintsAction = Action & {
  type: "REORDER_CONSTRAINTS";
  input: ReorderConstraintsInput;
};

export type ProblemSheetConstraintsAction =
  | AddConstraintAction
  | UpdateConstraintAction
  | RemoveConstraintAction
  | ReorderConstraintsAction;
