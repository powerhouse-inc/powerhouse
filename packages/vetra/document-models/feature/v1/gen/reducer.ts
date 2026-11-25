/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { FeaturePHState } from "document-models/feature/v1";

import { featureAgentFeedbackOperations } from "../src/reducers/agent-feedback.js";
import { featureDefinitionOperations } from "../src/reducers/definition.js";
import { featureEvidenceOperations } from "../src/reducers/evidence.js";
import { featureLifecycleOperations } from "../src/reducers/lifecycle.js";
import { featureReferencesOperations } from "../src/reducers/references.js";
import { featureSegmentRefsOperations } from "../src/reducers/segment-refs.js";
import { featureTargetsOperations } from "../src/reducers/targets.js";

import {
  AddEvidenceInputSchema,
  AddOutcomeTargetInputSchema,
  AddSegmentRefInputSchema,
  AddSuggestionInputSchema,
  ArchiveFeatureInputSchema,
  ClearEstimatesInputSchema,
  ClearExpectedEffectInputSchema,
  ClearFeatureNameInputSchema,
  ClearNotesInputSchema,
  ClearParentFeatureInputSchema,
  ClearPremiseInputSchema,
  ClearPromotionInputSchema,
  ClearReasoningInputSchema,
  ClearRelatedStepInputSchema,
  ClearRoleInputSchema,
  ClearSummaryInputSchema,
  ClearTargetReleaseInputSchema,
  ClearWbsInputSchema,
  CommitFeatureInputSchema,
  ParkFeatureInputSchema,
  PromoteToSpecInputSchema,
  RemoveEvidenceInputSchema,
  RemoveOutcomeTargetInputSchema,
  RemoveSegmentRefInputSchema,
  RemoveSuggestionInputSchema,
  ReopenFeatureInputSchema,
  ReorderOutcomeTargetsInputSchema,
  ReorderSegmentRefsInputSchema,
  ResolveSuggestionInputSchema,
  SetConfidenceInputSchema,
  SetEffortInputSchema,
  SetExpectedEffectInputSchema,
  SetFeatureNameInputSchema,
  SetImpactInputSchema,
  SetNotesInputSchema,
  SetParentFeatureInputSchema,
  SetPremiseInputSchema,
  SetReadyForFeedbackInputSchema,
  SetReasoningInputSchema,
  SetRelatedStepInputSchema,
  SetRoleInputSchema,
  SetScopeInputSchema,
  SetSummaryInputSchema,
  SetTargetReleaseInputSchema,
  SetWbsInputSchema,
  StartEvaluationInputSchema,
  UpdateEvidenceInputSchema,
  UpdateOutcomeTargetInputSchema,
  UpdateOutcomeTargetSnippetInputSchema,
  UpdateParentFeatureSnippetInputSchema,
  UpdateRelatedStepSnippetInputSchema,
  UpdateRoleSnippetInputSchema,
  UpdateSegmentRefSnippetInputSchema,
  UpdateWbsSnippetInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<FeaturePHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "SET_FEATURE_NAME": {
      SetFeatureNameInputSchema().parse(action.input);

      featureDefinitionOperations.setFeatureNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_FEATURE_NAME": {
      ClearFeatureNameInputSchema().parse(action.input);

      featureDefinitionOperations.clearFeatureNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_SUMMARY": {
      SetSummaryInputSchema().parse(action.input);

      featureDefinitionOperations.setSummaryOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_SUMMARY": {
      ClearSummaryInputSchema().parse(action.input);

      featureDefinitionOperations.clearSummaryOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_SCOPE": {
      SetScopeInputSchema().parse(action.input);

      featureDefinitionOperations.setScopeOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_PREMISE": {
      SetPremiseInputSchema().parse(action.input);

      featureDefinitionOperations.setPremiseOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_PREMISE": {
      ClearPremiseInputSchema().parse(action.input);

      featureDefinitionOperations.clearPremiseOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_EXPECTED_EFFECT": {
      SetExpectedEffectInputSchema().parse(action.input);

      featureDefinitionOperations.setExpectedEffectOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_EXPECTED_EFFECT": {
      ClearExpectedEffectInputSchema().parse(action.input);

      featureDefinitionOperations.clearExpectedEffectOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_REASONING": {
      SetReasoningInputSchema().parse(action.input);

      featureDefinitionOperations.setReasoningOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_REASONING": {
      ClearReasoningInputSchema().parse(action.input);

      featureDefinitionOperations.clearReasoningOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_NOTES": {
      SetNotesInputSchema().parse(action.input);

      featureDefinitionOperations.setNotesOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_NOTES": {
      ClearNotesInputSchema().parse(action.input);

      featureDefinitionOperations.clearNotesOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_TARGET_RELEASE": {
      SetTargetReleaseInputSchema().parse(action.input);

      featureDefinitionOperations.setTargetReleaseOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_TARGET_RELEASE": {
      ClearTargetReleaseInputSchema().parse(action.input);

      featureDefinitionOperations.clearTargetReleaseOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_CONFIDENCE": {
      SetConfidenceInputSchema().parse(action.input);

      featureDefinitionOperations.setConfidenceOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_EFFORT": {
      SetEffortInputSchema().parse(action.input);

      featureDefinitionOperations.setEffortOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_IMPACT": {
      SetImpactInputSchema().parse(action.input);

      featureDefinitionOperations.setImpactOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_ESTIMATES": {
      ClearEstimatesInputSchema().parse(action.input);

      featureDefinitionOperations.clearEstimatesOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_OUTCOME_TARGET": {
      AddOutcomeTargetInputSchema().parse(action.input);

      featureTargetsOperations.addOutcomeTargetOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_OUTCOME_TARGET": {
      UpdateOutcomeTargetInputSchema().parse(action.input);

      featureTargetsOperations.updateOutcomeTargetOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_OUTCOME_TARGET_SNIPPET": {
      UpdateOutcomeTargetSnippetInputSchema().parse(action.input);

      featureTargetsOperations.updateOutcomeTargetSnippetOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_OUTCOME_TARGET": {
      RemoveOutcomeTargetInputSchema().parse(action.input);

      featureTargetsOperations.removeOutcomeTargetOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REORDER_OUTCOME_TARGETS": {
      ReorderOutcomeTargetsInputSchema().parse(action.input);

      featureTargetsOperations.reorderOutcomeTargetsOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_SEGMENT_REF": {
      AddSegmentRefInputSchema().parse(action.input);

      featureSegmentRefsOperations.addSegmentRefOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_SEGMENT_REF_SNIPPET": {
      UpdateSegmentRefSnippetInputSchema().parse(action.input);

      featureSegmentRefsOperations.updateSegmentRefSnippetOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_SEGMENT_REF": {
      RemoveSegmentRefInputSchema().parse(action.input);

      featureSegmentRefsOperations.removeSegmentRefOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REORDER_SEGMENT_REFS": {
      ReorderSegmentRefsInputSchema().parse(action.input);

      featureSegmentRefsOperations.reorderSegmentRefsOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_ROLE": {
      SetRoleInputSchema().parse(action.input);

      featureReferencesOperations.setRoleOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_ROLE_SNIPPET": {
      UpdateRoleSnippetInputSchema().parse(action.input);

      featureReferencesOperations.updateRoleSnippetOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_ROLE": {
      ClearRoleInputSchema().parse(action.input);

      featureReferencesOperations.clearRoleOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_RELATED_STEP": {
      SetRelatedStepInputSchema().parse(action.input);

      featureReferencesOperations.setRelatedStepOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_RELATED_STEP_SNIPPET": {
      UpdateRelatedStepSnippetInputSchema().parse(action.input);

      featureReferencesOperations.updateRelatedStepSnippetOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_RELATED_STEP": {
      ClearRelatedStepInputSchema().parse(action.input);

      featureReferencesOperations.clearRelatedStepOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_PARENT_FEATURE": {
      SetParentFeatureInputSchema().parse(action.input);

      featureReferencesOperations.setParentFeatureOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_PARENT_FEATURE_SNIPPET": {
      UpdateParentFeatureSnippetInputSchema().parse(action.input);

      featureReferencesOperations.updateParentFeatureSnippetOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_PARENT_FEATURE": {
      ClearParentFeatureInputSchema().parse(action.input);

      featureReferencesOperations.clearParentFeatureOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_WBS": {
      SetWbsInputSchema().parse(action.input);

      featureReferencesOperations.setWbsOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_WBS_SNIPPET": {
      UpdateWbsSnippetInputSchema().parse(action.input);

      featureReferencesOperations.updateWbsSnippetOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_WBS": {
      ClearWbsInputSchema().parse(action.input);

      featureReferencesOperations.clearWbsOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "START_EVALUATION": {
      StartEvaluationInputSchema().parse(action.input);

      featureLifecycleOperations.startEvaluationOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "COMMIT_FEATURE": {
      CommitFeatureInputSchema().parse(action.input);

      featureLifecycleOperations.commitFeatureOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "PROMOTE_TO_SPEC": {
      PromoteToSpecInputSchema().parse(action.input);

      featureLifecycleOperations.promoteToSpecOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ARCHIVE_FEATURE": {
      ArchiveFeatureInputSchema().parse(action.input);

      featureLifecycleOperations.archiveFeatureOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "PARK_FEATURE": {
      ParkFeatureInputSchema().parse(action.input);

      featureLifecycleOperations.parkFeatureOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REOPEN_FEATURE": {
      ReopenFeatureInputSchema().parse(action.input);

      featureLifecycleOperations.reopenFeatureOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_PROMOTION": {
      ClearPromotionInputSchema().parse(action.input);

      featureLifecycleOperations.clearPromotionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_EVIDENCE": {
      AddEvidenceInputSchema().parse(action.input);

      featureEvidenceOperations.addEvidenceOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_EVIDENCE": {
      UpdateEvidenceInputSchema().parse(action.input);

      featureEvidenceOperations.updateEvidenceOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_EVIDENCE": {
      RemoveEvidenceInputSchema().parse(action.input);

      featureEvidenceOperations.removeEvidenceOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_READY_FOR_FEEDBACK": {
      SetReadyForFeedbackInputSchema().parse(action.input);

      featureAgentFeedbackOperations.setReadyForFeedbackOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_SUGGESTION": {
      AddSuggestionInputSchema().parse(action.input);

      featureAgentFeedbackOperations.addSuggestionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "RESOLVE_SUGGESTION": {
      ResolveSuggestionInputSchema().parse(action.input);

      featureAgentFeedbackOperations.resolveSuggestionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_SUGGESTION": {
      RemoveSuggestionInputSchema().parse(action.input);

      featureAgentFeedbackOperations.removeSuggestionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer: Reducer<FeaturePHState> = createReducer(stateReducer);
