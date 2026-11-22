/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddOutcomeTargetInput,
  RemoveOutcomeTargetInput,
  ReorderOutcomeTargetsInput,
  UpdateOutcomeTargetInput,
  UpdateOutcomeTargetSnippetInput,
} from "../types.js";

export type AddOutcomeTargetAction = Action & {
  type: "ADD_OUTCOME_TARGET";
  input: AddOutcomeTargetInput;
};
export type UpdateOutcomeTargetAction = Action & {
  type: "UPDATE_OUTCOME_TARGET";
  input: UpdateOutcomeTargetInput;
};
export type UpdateOutcomeTargetSnippetAction = Action & {
  type: "UPDATE_OUTCOME_TARGET_SNIPPET";
  input: UpdateOutcomeTargetSnippetInput;
};
export type RemoveOutcomeTargetAction = Action & {
  type: "REMOVE_OUTCOME_TARGET";
  input: RemoveOutcomeTargetInput;
};
export type ReorderOutcomeTargetsAction = Action & {
  type: "REORDER_OUTCOME_TARGETS";
  input: ReorderOutcomeTargetsInput;
};

export type FeatureTargetsAction =
  | AddOutcomeTargetAction
  | UpdateOutcomeTargetAction
  | UpdateOutcomeTargetSnippetAction
  | RemoveOutcomeTargetAction
  | ReorderOutcomeTargetsAction;
