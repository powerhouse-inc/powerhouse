/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddEvidenceInput,
  RemoveEvidenceInput,
  UpdateEvidenceInput,
} from "../types.js";

export type AddEvidenceAction = Action & {
  type: "ADD_EVIDENCE";
  input: AddEvidenceInput;
};
export type UpdateEvidenceAction = Action & {
  type: "UPDATE_EVIDENCE";
  input: UpdateEvidenceInput;
};
export type RemoveEvidenceAction = Action & {
  type: "REMOVE_EVIDENCE";
  input: RemoveEvidenceInput;
};

export type FeatureEvidenceAction =
  | AddEvidenceAction
  | UpdateEvidenceAction
  | RemoveEvidenceAction;
