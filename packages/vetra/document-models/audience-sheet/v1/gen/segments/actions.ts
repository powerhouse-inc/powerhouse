/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddOutcomePriorityInput,
  AddSegmentEvidenceInput,
  AddSegmentInput,
  AddSegmentRoleInput,
  RemoveOutcomePriorityInput,
  RemoveSegmentEvidenceInput,
  RemoveSegmentInput,
  RemoveSegmentRoleInput,
  ReorderOutcomePrioritiesInput,
  ReorderSegmentRolesInput,
  ReorderSegmentsInput,
  UpdateOutcomePriorityInput,
  UpdateOutcomePrioritySnippetInput,
  UpdateSegmentEvidenceInput,
  UpdateSegmentInput,
  UpdateSegmentRoleSnippetInput,
} from "../types.js";

export type AddSegmentAction = Action & {
  type: "ADD_SEGMENT";
  input: AddSegmentInput;
};
export type UpdateSegmentAction = Action & {
  type: "UPDATE_SEGMENT";
  input: UpdateSegmentInput;
};
export type RemoveSegmentAction = Action & {
  type: "REMOVE_SEGMENT";
  input: RemoveSegmentInput;
};
export type ReorderSegmentsAction = Action & {
  type: "REORDER_SEGMENTS";
  input: ReorderSegmentsInput;
};
export type AddSegmentRoleAction = Action & {
  type: "ADD_SEGMENT_ROLE";
  input: AddSegmentRoleInput;
};
export type UpdateSegmentRoleSnippetAction = Action & {
  type: "UPDATE_SEGMENT_ROLE_SNIPPET";
  input: UpdateSegmentRoleSnippetInput;
};
export type RemoveSegmentRoleAction = Action & {
  type: "REMOVE_SEGMENT_ROLE";
  input: RemoveSegmentRoleInput;
};
export type ReorderSegmentRolesAction = Action & {
  type: "REORDER_SEGMENT_ROLES";
  input: ReorderSegmentRolesInput;
};
export type AddOutcomePriorityAction = Action & {
  type: "ADD_OUTCOME_PRIORITY";
  input: AddOutcomePriorityInput;
};
export type UpdateOutcomePriorityAction = Action & {
  type: "UPDATE_OUTCOME_PRIORITY";
  input: UpdateOutcomePriorityInput;
};
export type UpdateOutcomePrioritySnippetAction = Action & {
  type: "UPDATE_OUTCOME_PRIORITY_SNIPPET";
  input: UpdateOutcomePrioritySnippetInput;
};
export type RemoveOutcomePriorityAction = Action & {
  type: "REMOVE_OUTCOME_PRIORITY";
  input: RemoveOutcomePriorityInput;
};
export type ReorderOutcomePrioritiesAction = Action & {
  type: "REORDER_OUTCOME_PRIORITIES";
  input: ReorderOutcomePrioritiesInput;
};
export type AddSegmentEvidenceAction = Action & {
  type: "ADD_SEGMENT_EVIDENCE";
  input: AddSegmentEvidenceInput;
};
export type UpdateSegmentEvidenceAction = Action & {
  type: "UPDATE_SEGMENT_EVIDENCE";
  input: UpdateSegmentEvidenceInput;
};
export type RemoveSegmentEvidenceAction = Action & {
  type: "REMOVE_SEGMENT_EVIDENCE";
  input: RemoveSegmentEvidenceInput;
};

export type AudienceSheetSegmentsAction =
  | AddSegmentAction
  | UpdateSegmentAction
  | RemoveSegmentAction
  | ReorderSegmentsAction
  | AddSegmentRoleAction
  | UpdateSegmentRoleSnippetAction
  | RemoveSegmentRoleAction
  | ReorderSegmentRolesAction
  | AddOutcomePriorityAction
  | UpdateOutcomePriorityAction
  | UpdateOutcomePrioritySnippetAction
  | RemoveOutcomePriorityAction
  | ReorderOutcomePrioritiesAction
  | AddSegmentEvidenceAction
  | UpdateSegmentEvidenceAction
  | RemoveSegmentEvidenceAction;
