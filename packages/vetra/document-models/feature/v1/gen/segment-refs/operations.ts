/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { FeatureGlobalState } from "../types.js";
import type {
  AddSegmentRefAction,
  RemoveSegmentRefAction,
  ReorderSegmentRefsAction,
  UpdateSegmentRefSnippetAction,
} from "./actions.js";

export interface FeatureSegmentRefsOperations {
  addSegmentRefOperation: (
    state: FeatureGlobalState,
    action: AddSegmentRefAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateSegmentRefSnippetOperation: (
    state: FeatureGlobalState,
    action: UpdateSegmentRefSnippetAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeSegmentRefOperation: (
    state: FeatureGlobalState,
    action: RemoveSegmentRefAction,
    dispatch?: SignalDispatch,
  ) => void;
  reorderSegmentRefsOperation: (
    state: FeatureGlobalState,
    action: ReorderSegmentRefsAction,
    dispatch?: SignalDispatch,
  ) => void;
}
