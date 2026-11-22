/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { FeatureGlobalState } from "../types.js";
import type {
  ClearEstimatesAction,
  ClearExpectedEffectAction,
  ClearFeatureNameAction,
  ClearNotesAction,
  ClearPremiseAction,
  ClearReasoningAction,
  ClearSummaryAction,
  ClearTargetReleaseAction,
  SetConfidenceAction,
  SetEffortAction,
  SetExpectedEffectAction,
  SetFeatureNameAction,
  SetImpactAction,
  SetNotesAction,
  SetPremiseAction,
  SetReasoningAction,
  SetScopeAction,
  SetSummaryAction,
  SetTargetReleaseAction,
} from "./actions.js";

export interface FeatureDefinitionOperations {
  setFeatureNameOperation: (
    state: FeatureGlobalState,
    action: SetFeatureNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearFeatureNameOperation: (
    state: FeatureGlobalState,
    action: ClearFeatureNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  setSummaryOperation: (
    state: FeatureGlobalState,
    action: SetSummaryAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearSummaryOperation: (
    state: FeatureGlobalState,
    action: ClearSummaryAction,
    dispatch?: SignalDispatch,
  ) => void;
  setScopeOperation: (
    state: FeatureGlobalState,
    action: SetScopeAction,
    dispatch?: SignalDispatch,
  ) => void;
  setPremiseOperation: (
    state: FeatureGlobalState,
    action: SetPremiseAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearPremiseOperation: (
    state: FeatureGlobalState,
    action: ClearPremiseAction,
    dispatch?: SignalDispatch,
  ) => void;
  setExpectedEffectOperation: (
    state: FeatureGlobalState,
    action: SetExpectedEffectAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearExpectedEffectOperation: (
    state: FeatureGlobalState,
    action: ClearExpectedEffectAction,
    dispatch?: SignalDispatch,
  ) => void;
  setReasoningOperation: (
    state: FeatureGlobalState,
    action: SetReasoningAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearReasoningOperation: (
    state: FeatureGlobalState,
    action: ClearReasoningAction,
    dispatch?: SignalDispatch,
  ) => void;
  setNotesOperation: (
    state: FeatureGlobalState,
    action: SetNotesAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearNotesOperation: (
    state: FeatureGlobalState,
    action: ClearNotesAction,
    dispatch?: SignalDispatch,
  ) => void;
  setTargetReleaseOperation: (
    state: FeatureGlobalState,
    action: SetTargetReleaseAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearTargetReleaseOperation: (
    state: FeatureGlobalState,
    action: ClearTargetReleaseAction,
    dispatch?: SignalDispatch,
  ) => void;
  setConfidenceOperation: (
    state: FeatureGlobalState,
    action: SetConfidenceAction,
    dispatch?: SignalDispatch,
  ) => void;
  setEffortOperation: (
    state: FeatureGlobalState,
    action: SetEffortAction,
    dispatch?: SignalDispatch,
  ) => void;
  setImpactOperation: (
    state: FeatureGlobalState,
    action: SetImpactAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearEstimatesOperation: (
    state: FeatureGlobalState,
    action: ClearEstimatesAction,
    dispatch?: SignalDispatch,
  ) => void;
}
