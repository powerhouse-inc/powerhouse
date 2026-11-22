/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  ClearEstimatesInputSchema,
  ClearExpectedEffectInputSchema,
  ClearFeatureNameInputSchema,
  ClearNotesInputSchema,
  ClearPremiseInputSchema,
  ClearReasoningInputSchema,
  ClearSummaryInputSchema,
  ClearTargetReleaseInputSchema,
  SetConfidenceInputSchema,
  SetEffortInputSchema,
  SetExpectedEffectInputSchema,
  SetFeatureNameInputSchema,
  SetImpactInputSchema,
  SetNotesInputSchema,
  SetPremiseInputSchema,
  SetReasoningInputSchema,
  SetScopeInputSchema,
  SetSummaryInputSchema,
  SetTargetReleaseInputSchema,
} from "../schema/zod.js";
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

export const setFeatureName = (input: SetFeatureNameInput) =>
  createAction<SetFeatureNameAction>(
    "SET_FEATURE_NAME",
    { ...input },
    undefined,
    SetFeatureNameInputSchema,
    "global",
  );

export const clearFeatureName = (input: ClearFeatureNameInput) =>
  createAction<ClearFeatureNameAction>(
    "CLEAR_FEATURE_NAME",
    { ...input },
    undefined,
    ClearFeatureNameInputSchema,
    "global",
  );

export const setSummary = (input: SetSummaryInput) =>
  createAction<SetSummaryAction>(
    "SET_SUMMARY",
    { ...input },
    undefined,
    SetSummaryInputSchema,
    "global",
  );

export const clearSummary = (input: ClearSummaryInput) =>
  createAction<ClearSummaryAction>(
    "CLEAR_SUMMARY",
    { ...input },
    undefined,
    ClearSummaryInputSchema,
    "global",
  );

export const setScope = (input: SetScopeInput) =>
  createAction<SetScopeAction>(
    "SET_SCOPE",
    { ...input },
    undefined,
    SetScopeInputSchema,
    "global",
  );

export const setPremise = (input: SetPremiseInput) =>
  createAction<SetPremiseAction>(
    "SET_PREMISE",
    { ...input },
    undefined,
    SetPremiseInputSchema,
    "global",
  );

export const clearPremise = (input: ClearPremiseInput) =>
  createAction<ClearPremiseAction>(
    "CLEAR_PREMISE",
    { ...input },
    undefined,
    ClearPremiseInputSchema,
    "global",
  );

export const setExpectedEffect = (input: SetExpectedEffectInput) =>
  createAction<SetExpectedEffectAction>(
    "SET_EXPECTED_EFFECT",
    { ...input },
    undefined,
    SetExpectedEffectInputSchema,
    "global",
  );

export const clearExpectedEffect = (input: ClearExpectedEffectInput) =>
  createAction<ClearExpectedEffectAction>(
    "CLEAR_EXPECTED_EFFECT",
    { ...input },
    undefined,
    ClearExpectedEffectInputSchema,
    "global",
  );

export const setReasoning = (input: SetReasoningInput) =>
  createAction<SetReasoningAction>(
    "SET_REASONING",
    { ...input },
    undefined,
    SetReasoningInputSchema,
    "global",
  );

export const clearReasoning = (input: ClearReasoningInput) =>
  createAction<ClearReasoningAction>(
    "CLEAR_REASONING",
    { ...input },
    undefined,
    ClearReasoningInputSchema,
    "global",
  );

export const setNotes = (input: SetNotesInput) =>
  createAction<SetNotesAction>(
    "SET_NOTES",
    { ...input },
    undefined,
    SetNotesInputSchema,
    "global",
  );

export const clearNotes = (input: ClearNotesInput) =>
  createAction<ClearNotesAction>(
    "CLEAR_NOTES",
    { ...input },
    undefined,
    ClearNotesInputSchema,
    "global",
  );

export const setTargetRelease = (input: SetTargetReleaseInput) =>
  createAction<SetTargetReleaseAction>(
    "SET_TARGET_RELEASE",
    { ...input },
    undefined,
    SetTargetReleaseInputSchema,
    "global",
  );

export const clearTargetRelease = (input: ClearTargetReleaseInput) =>
  createAction<ClearTargetReleaseAction>(
    "CLEAR_TARGET_RELEASE",
    { ...input },
    undefined,
    ClearTargetReleaseInputSchema,
    "global",
  );

export const setConfidence = (input: SetConfidenceInput) =>
  createAction<SetConfidenceAction>(
    "SET_CONFIDENCE",
    { ...input },
    undefined,
    SetConfidenceInputSchema,
    "global",
  );

export const setEffort = (input: SetEffortInput) =>
  createAction<SetEffortAction>(
    "SET_EFFORT",
    { ...input },
    undefined,
    SetEffortInputSchema,
    "global",
  );

export const setImpact = (input: SetImpactInput) =>
  createAction<SetImpactAction>(
    "SET_IMPACT",
    { ...input },
    undefined,
    SetImpactInputSchema,
    "global",
  );

export const clearEstimates = (input: ClearEstimatesInput) =>
  createAction<ClearEstimatesAction>(
    "CLEAR_ESTIMATES",
    { ...input },
    undefined,
    ClearEstimatesInputSchema,
    "global",
  );
