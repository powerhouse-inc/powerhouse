/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { FeatureGlobalState } from "../types.js";
import type {
  AddOutcomeTargetAction,
  RemoveOutcomeTargetAction,
  ReorderOutcomeTargetsAction,
  UpdateOutcomeTargetAction,
  UpdateOutcomeTargetSnippetAction,
} from "./actions.js";

export interface FeatureTargetsOperations {
  addOutcomeTargetOperation: (
    state: FeatureGlobalState,
    action: AddOutcomeTargetAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateOutcomeTargetOperation: (
    state: FeatureGlobalState,
    action: UpdateOutcomeTargetAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateOutcomeTargetSnippetOperation: (
    state: FeatureGlobalState,
    action: UpdateOutcomeTargetSnippetAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeOutcomeTargetOperation: (
    state: FeatureGlobalState,
    action: RemoveOutcomeTargetAction,
    dispatch?: SignalDispatch,
  ) => void;
  reorderOutcomeTargetsOperation: (
    state: FeatureGlobalState,
    action: ReorderOutcomeTargetsAction,
    dispatch?: SignalDispatch,
  ) => void;
}
