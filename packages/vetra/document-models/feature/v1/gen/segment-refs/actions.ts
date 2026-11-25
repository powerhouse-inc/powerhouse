/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddSegmentRefInput,
  RemoveSegmentRefInput,
  ReorderSegmentRefsInput,
  UpdateSegmentRefSnippetInput,
} from "../types.js";

export type AddSegmentRefAction = Action & {
  type: "ADD_SEGMENT_REF";
  input: AddSegmentRefInput;
};
export type UpdateSegmentRefSnippetAction = Action & {
  type: "UPDATE_SEGMENT_REF_SNIPPET";
  input: UpdateSegmentRefSnippetInput;
};
export type RemoveSegmentRefAction = Action & {
  type: "REMOVE_SEGMENT_REF";
  input: RemoveSegmentRefInput;
};
export type ReorderSegmentRefsAction = Action & {
  type: "REORDER_SEGMENT_REFS";
  input: ReorderSegmentRefsInput;
};

export type FeatureSegmentRefsAction =
  | AddSegmentRefAction
  | UpdateSegmentRefSnippetAction
  | RemoveSegmentRefAction
  | ReorderSegmentRefsAction;
