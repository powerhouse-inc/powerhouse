/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  ClearEstimatesInput,
  ClearExpectedEffectInput,
  ClearFeatureNameInput,
  ClearNotesInput,
  ClearPremiseInput,
  ClearReasoningInput,
  ClearSummaryInput,
  ClearTargetReleaseInput,
  SetConfidenceInput,
  SetEffortInput,
  SetExpectedEffectInput,
  SetFeatureNameInput,
  SetImpactInput,
  SetNotesInput,
  SetPremiseInput,
  SetReasoningInput,
  SetScopeInput,
  SetSummaryInput,
  SetTargetReleaseInput,
} from "../types.js";

export type SetFeatureNameAction = Action & {
  type: "SET_FEATURE_NAME";
  input: SetFeatureNameInput;
};
export type ClearFeatureNameAction = Action & {
  type: "CLEAR_FEATURE_NAME";
  input: ClearFeatureNameInput;
};
export type SetSummaryAction = Action & {
  type: "SET_SUMMARY";
  input: SetSummaryInput;
};
export type ClearSummaryAction = Action & {
  type: "CLEAR_SUMMARY";
  input: ClearSummaryInput;
};
export type SetScopeAction = Action & {
  type: "SET_SCOPE";
  input: SetScopeInput;
};
export type SetPremiseAction = Action & {
  type: "SET_PREMISE";
  input: SetPremiseInput;
};
export type ClearPremiseAction = Action & {
  type: "CLEAR_PREMISE";
  input: ClearPremiseInput;
};
export type SetExpectedEffectAction = Action & {
  type: "SET_EXPECTED_EFFECT";
  input: SetExpectedEffectInput;
};
export type ClearExpectedEffectAction = Action & {
  type: "CLEAR_EXPECTED_EFFECT";
  input: ClearExpectedEffectInput;
};
export type SetReasoningAction = Action & {
  type: "SET_REASONING";
  input: SetReasoningInput;
};
export type ClearReasoningAction = Action & {
  type: "CLEAR_REASONING";
  input: ClearReasoningInput;
};
export type SetNotesAction = Action & {
  type: "SET_NOTES";
  input: SetNotesInput;
};
export type ClearNotesAction = Action & {
  type: "CLEAR_NOTES";
  input: ClearNotesInput;
};
export type SetTargetReleaseAction = Action & {
  type: "SET_TARGET_RELEASE";
  input: SetTargetReleaseInput;
};
export type ClearTargetReleaseAction = Action & {
  type: "CLEAR_TARGET_RELEASE";
  input: ClearTargetReleaseInput;
};
export type SetConfidenceAction = Action & {
  type: "SET_CONFIDENCE";
  input: SetConfidenceInput;
};
export type SetEffortAction = Action & {
  type: "SET_EFFORT";
  input: SetEffortInput;
};
export type SetImpactAction = Action & {
  type: "SET_IMPACT";
  input: SetImpactInput;
};
export type ClearEstimatesAction = Action & {
  type: "CLEAR_ESTIMATES";
  input: ClearEstimatesInput;
};

export type FeatureDefinitionAction =
  | SetFeatureNameAction
  | ClearFeatureNameAction
  | SetSummaryAction
  | ClearSummaryAction
  | SetScopeAction
  | SetPremiseAction
  | ClearPremiseAction
  | SetExpectedEffectAction
  | ClearExpectedEffectAction
  | SetReasoningAction
  | ClearReasoningAction
  | SetNotesAction
  | ClearNotesAction
  | SetTargetReleaseAction
  | ClearTargetReleaseAction
  | SetConfidenceAction
  | SetEffortAction
  | SetImpactAction
  | ClearEstimatesAction;
