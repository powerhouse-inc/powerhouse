import type { FeatureDefinitionOperations } from "document-models/feature/v1";

export const featureDefinitionOperations: FeatureDefinitionOperations = {
  setFeatureNameOperation(state, action) {
    state.name = action.input.name;
  },
  clearFeatureNameOperation(state) {
    state.name = null;
  },
  setSummaryOperation(state, action) {
    state.summary = action.input.summary;
  },
  clearSummaryOperation(state) {
    state.summary = null;
  },
  setScopeOperation(state, action) {
    state.scope = action.input.scope;
  },
  setPremiseOperation(state, action) {
    state.premise = action.input.premise;
  },
  clearPremiseOperation(state) {
    state.premise = null;
  },
  setExpectedEffectOperation(state, action) {
    state.expectedEffect = action.input.expectedEffect;
  },
  clearExpectedEffectOperation(state) {
    state.expectedEffect = null;
  },
  setReasoningOperation(state, action) {
    state.reasoning = action.input.reasoning;
  },
  clearReasoningOperation(state) {
    state.reasoning = null;
  },
  setNotesOperation(state, action) {
    state.notes = action.input.notes;
  },
  clearNotesOperation(state) {
    state.notes = null;
  },
  setTargetReleaseOperation(state, action) {
    state.targetRelease = action.input.targetRelease;
  },
  clearTargetReleaseOperation(state) {
    state.targetRelease = null;
  },
  setConfidenceOperation(state, action) {
    state.confidence = action.input.confidence;
  },
  setEffortOperation(state, action) {
    state.effort = action.input.effort;
  },
  setImpactOperation(state, action) {
    state.impact = action.input.impact;
  },
  clearEstimatesOperation(state) {
    state.confidence = null;
    state.effort = null;
    state.impact = null;
  },
};
