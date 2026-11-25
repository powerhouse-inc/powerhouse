/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { AudienceSheetPHState } from "document-models/audience-sheet/v1";

import { audienceSheetAgentFeedbackOperations } from "../src/reducers/agent-feedback.js";
import { audienceSheetSegmentsOperations } from "../src/reducers/segments.js";

import {
  AddOutcomePriorityInputSchema,
  AddSegmentEvidenceInputSchema,
  AddSegmentInputSchema,
  AddSegmentRoleInputSchema,
  AddSuggestionInputSchema,
  RemoveOutcomePriorityInputSchema,
  RemoveSegmentEvidenceInputSchema,
  RemoveSegmentInputSchema,
  RemoveSegmentRoleInputSchema,
  RemoveSuggestionInputSchema,
  ReorderOutcomePrioritiesInputSchema,
  ReorderSegmentRolesInputSchema,
  ReorderSegmentsInputSchema,
  ResolveSuggestionInputSchema,
  SetReadyForFeedbackInputSchema,
  UpdateOutcomePriorityInputSchema,
  UpdateOutcomePrioritySnippetInputSchema,
  UpdateSegmentEvidenceInputSchema,
  UpdateSegmentInputSchema,
  UpdateSegmentRoleSnippetInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<AudienceSheetPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "ADD_SEGMENT": {
      AddSegmentInputSchema().parse(action.input);

      audienceSheetSegmentsOperations.addSegmentOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_SEGMENT": {
      UpdateSegmentInputSchema().parse(action.input);

      audienceSheetSegmentsOperations.updateSegmentOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_SEGMENT": {
      RemoveSegmentInputSchema().parse(action.input);

      audienceSheetSegmentsOperations.removeSegmentOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REORDER_SEGMENTS": {
      ReorderSegmentsInputSchema().parse(action.input);

      audienceSheetSegmentsOperations.reorderSegmentsOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_SEGMENT_ROLE": {
      AddSegmentRoleInputSchema().parse(action.input);

      audienceSheetSegmentsOperations.addSegmentRoleOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_SEGMENT_ROLE_SNIPPET": {
      UpdateSegmentRoleSnippetInputSchema().parse(action.input);

      audienceSheetSegmentsOperations.updateSegmentRoleSnippetOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_SEGMENT_ROLE": {
      RemoveSegmentRoleInputSchema().parse(action.input);

      audienceSheetSegmentsOperations.removeSegmentRoleOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REORDER_SEGMENT_ROLES": {
      ReorderSegmentRolesInputSchema().parse(action.input);

      audienceSheetSegmentsOperations.reorderSegmentRolesOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_OUTCOME_PRIORITY": {
      AddOutcomePriorityInputSchema().parse(action.input);

      audienceSheetSegmentsOperations.addOutcomePriorityOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_OUTCOME_PRIORITY": {
      UpdateOutcomePriorityInputSchema().parse(action.input);

      audienceSheetSegmentsOperations.updateOutcomePriorityOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_OUTCOME_PRIORITY_SNIPPET": {
      UpdateOutcomePrioritySnippetInputSchema().parse(action.input);

      audienceSheetSegmentsOperations.updateOutcomePrioritySnippetOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_OUTCOME_PRIORITY": {
      RemoveOutcomePriorityInputSchema().parse(action.input);

      audienceSheetSegmentsOperations.removeOutcomePriorityOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REORDER_OUTCOME_PRIORITIES": {
      ReorderOutcomePrioritiesInputSchema().parse(action.input);

      audienceSheetSegmentsOperations.reorderOutcomePrioritiesOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_SEGMENT_EVIDENCE": {
      AddSegmentEvidenceInputSchema().parse(action.input);

      audienceSheetSegmentsOperations.addSegmentEvidenceOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_SEGMENT_EVIDENCE": {
      UpdateSegmentEvidenceInputSchema().parse(action.input);

      audienceSheetSegmentsOperations.updateSegmentEvidenceOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_SEGMENT_EVIDENCE": {
      RemoveSegmentEvidenceInputSchema().parse(action.input);

      audienceSheetSegmentsOperations.removeSegmentEvidenceOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_READY_FOR_FEEDBACK": {
      SetReadyForFeedbackInputSchema().parse(action.input);

      audienceSheetAgentFeedbackOperations.setReadyForFeedbackOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_SUGGESTION": {
      AddSuggestionInputSchema().parse(action.input);

      audienceSheetAgentFeedbackOperations.addSuggestionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "RESOLVE_SUGGESTION": {
      ResolveSuggestionInputSchema().parse(action.input);

      audienceSheetAgentFeedbackOperations.resolveSuggestionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_SUGGESTION": {
      RemoveSuggestionInputSchema().parse(action.input);

      audienceSheetAgentFeedbackOperations.removeSuggestionOperation(
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

export const reducer: Reducer<AudienceSheetPHState> =
  createReducer(stateReducer);
