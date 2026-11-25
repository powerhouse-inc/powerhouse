/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddOutcomeInput,
  ClearOutcomeMetricInput,
  ClearOutcomeRoleInput,
  ClearOutcomeStepInput,
  RemoveOutcomeInput,
  ReorderOutcomesInput,
  UpdateOutcomeInput,
} from "../types.js";

export type AddOutcomeAction = Action & {
  type: "ADD_OUTCOME";
  input: AddOutcomeInput;
};
export type UpdateOutcomeAction = Action & {
  type: "UPDATE_OUTCOME";
  input: UpdateOutcomeInput;
};
export type RemoveOutcomeAction = Action & {
  type: "REMOVE_OUTCOME";
  input: RemoveOutcomeInput;
};
export type ReorderOutcomesAction = Action & {
  type: "REORDER_OUTCOMES";
  input: ReorderOutcomesInput;
};
export type ClearOutcomeMetricAction = Action & {
  type: "CLEAR_OUTCOME_METRIC";
  input: ClearOutcomeMetricInput;
};
export type ClearOutcomeRoleAction = Action & {
  type: "CLEAR_OUTCOME_ROLE";
  input: ClearOutcomeRoleInput;
};
export type ClearOutcomeStepAction = Action & {
  type: "CLEAR_OUTCOME_STEP";
  input: ClearOutcomeStepInput;
};

export type ProblemSheetOutcomesAction =
  | AddOutcomeAction
  | UpdateOutcomeAction
  | RemoveOutcomeAction
  | ReorderOutcomesAction
  | ClearOutcomeMetricAction
  | ClearOutcomeRoleAction
  | ClearOutcomeStepAction;
