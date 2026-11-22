/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { FeatureGlobalState } from "../types.js";
import type {
  ClearParentFeatureAction,
  ClearRelatedStepAction,
  ClearRoleAction,
  ClearWbsAction,
  SetParentFeatureAction,
  SetRelatedStepAction,
  SetRoleAction,
  SetWbsAction,
  UpdateParentFeatureSnippetAction,
  UpdateRelatedStepSnippetAction,
  UpdateRoleSnippetAction,
  UpdateWbsSnippetAction,
} from "./actions.js";

export interface FeatureReferencesOperations {
  setRoleOperation: (
    state: FeatureGlobalState,
    action: SetRoleAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateRoleSnippetOperation: (
    state: FeatureGlobalState,
    action: UpdateRoleSnippetAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearRoleOperation: (
    state: FeatureGlobalState,
    action: ClearRoleAction,
    dispatch?: SignalDispatch,
  ) => void;
  setRelatedStepOperation: (
    state: FeatureGlobalState,
    action: SetRelatedStepAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateRelatedStepSnippetOperation: (
    state: FeatureGlobalState,
    action: UpdateRelatedStepSnippetAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearRelatedStepOperation: (
    state: FeatureGlobalState,
    action: ClearRelatedStepAction,
    dispatch?: SignalDispatch,
  ) => void;
  setParentFeatureOperation: (
    state: FeatureGlobalState,
    action: SetParentFeatureAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateParentFeatureSnippetOperation: (
    state: FeatureGlobalState,
    action: UpdateParentFeatureSnippetAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearParentFeatureOperation: (
    state: FeatureGlobalState,
    action: ClearParentFeatureAction,
    dispatch?: SignalDispatch,
  ) => void;
  setWbsOperation: (
    state: FeatureGlobalState,
    action: SetWbsAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateWbsSnippetOperation: (
    state: FeatureGlobalState,
    action: UpdateWbsSnippetAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearWbsOperation: (
    state: FeatureGlobalState,
    action: ClearWbsAction,
    dispatch?: SignalDispatch,
  ) => void;
}
