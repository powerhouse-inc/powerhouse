/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { ProblemSheetPHState } from "document-models/problem-sheet/v1";

import { problemSheetAgentFeedbackOperations } from "../src/reducers/agent-feedback.js";
import { problemSheetConstraintsOperations } from "../src/reducers/constraints.js";
import { problemSheetContextOperations } from "../src/reducers/context.js";
import { problemSheetCoreJobOperations } from "../src/reducers/core-job.js";
import { problemSheetJobStepsOperations } from "../src/reducers/job-steps.js";
import { problemSheetOutcomesOperations } from "../src/reducers/outcomes.js";
import { problemSheetRolesOperations } from "../src/reducers/roles.js";

import {
  AddConstraintInputSchema,
  AddJobStepInputSchema,
  AddOutcomeInputSchema,
  AddRoleInputSchema,
  AddSpecializedJobStepInputSchema,
  AddSuggestionInputSchema,
  ClearContextInputSchema,
  ClearCoreJobInputSchema,
  ClearOutcomeMetricInputSchema,
  ClearOutcomeRoleInputSchema,
  ClearOutcomeStepInputSchema,
  ClearRoleSpecializedJobInputSchema,
  RemoveConstraintInputSchema,
  RemoveJobStepInputSchema,
  RemoveOutcomeInputSchema,
  RemoveRoleInputSchema,
  RemoveSpecializedJobStepInputSchema,
  RemoveSuggestionInputSchema,
  ReorderConstraintsInputSchema,
  ReorderJobStepsInputSchema,
  ReorderOutcomesInputSchema,
  ReorderRolesInputSchema,
  ReorderSpecializedJobStepsInputSchema,
  ResolveSuggestionInputSchema,
  SetContextInputSchema,
  SetCoreJobInputSchema,
  SetReadyForFeedbackInputSchema,
  SetRoleSpecializedJobInputSchema,
  UpdateConstraintInputSchema,
  UpdateCoreJobInputSchema,
  UpdateJobStepInputSchema,
  UpdateOutcomeInputSchema,
  UpdateRoleInputSchema,
  UpdateRoleSpecializedJobInputSchema,
  UpdateSpecializedJobStepInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<ProblemSheetPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "SET_CONTEXT": {
      SetContextInputSchema().parse(action.input);

      problemSheetContextOperations.setContextOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_CONTEXT": {
      ClearContextInputSchema().parse(action.input);

      problemSheetContextOperations.clearContextOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_CORE_JOB": {
      SetCoreJobInputSchema().parse(action.input);

      problemSheetCoreJobOperations.setCoreJobOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_CORE_JOB": {
      UpdateCoreJobInputSchema().parse(action.input);

      problemSheetCoreJobOperations.updateCoreJobOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_CORE_JOB": {
      ClearCoreJobInputSchema().parse(action.input);

      problemSheetCoreJobOperations.clearCoreJobOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_JOB_STEP": {
      AddJobStepInputSchema().parse(action.input);

      problemSheetJobStepsOperations.addJobStepOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_JOB_STEP": {
      UpdateJobStepInputSchema().parse(action.input);

      problemSheetJobStepsOperations.updateJobStepOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_JOB_STEP": {
      RemoveJobStepInputSchema().parse(action.input);

      problemSheetJobStepsOperations.removeJobStepOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REORDER_JOB_STEPS": {
      ReorderJobStepsInputSchema().parse(action.input);

      problemSheetJobStepsOperations.reorderJobStepsOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_ROLE": {
      AddRoleInputSchema().parse(action.input);

      problemSheetRolesOperations.addRoleOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_ROLE": {
      UpdateRoleInputSchema().parse(action.input);

      problemSheetRolesOperations.updateRoleOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_ROLE": {
      RemoveRoleInputSchema().parse(action.input);

      problemSheetRolesOperations.removeRoleOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REORDER_ROLES": {
      ReorderRolesInputSchema().parse(action.input);

      problemSheetRolesOperations.reorderRolesOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_ROLE_SPECIALIZED_JOB": {
      SetRoleSpecializedJobInputSchema().parse(action.input);

      problemSheetRolesOperations.setRoleSpecializedJobOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_ROLE_SPECIALIZED_JOB": {
      UpdateRoleSpecializedJobInputSchema().parse(action.input);

      problemSheetRolesOperations.updateRoleSpecializedJobOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_ROLE_SPECIALIZED_JOB": {
      ClearRoleSpecializedJobInputSchema().parse(action.input);

      problemSheetRolesOperations.clearRoleSpecializedJobOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_SPECIALIZED_JOB_STEP": {
      AddSpecializedJobStepInputSchema().parse(action.input);

      problemSheetRolesOperations.addSpecializedJobStepOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_SPECIALIZED_JOB_STEP": {
      UpdateSpecializedJobStepInputSchema().parse(action.input);

      problemSheetRolesOperations.updateSpecializedJobStepOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_SPECIALIZED_JOB_STEP": {
      RemoveSpecializedJobStepInputSchema().parse(action.input);

      problemSheetRolesOperations.removeSpecializedJobStepOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REORDER_SPECIALIZED_JOB_STEPS": {
      ReorderSpecializedJobStepsInputSchema().parse(action.input);

      problemSheetRolesOperations.reorderSpecializedJobStepsOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_OUTCOME": {
      AddOutcomeInputSchema().parse(action.input);

      problemSheetOutcomesOperations.addOutcomeOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_OUTCOME": {
      UpdateOutcomeInputSchema().parse(action.input);

      problemSheetOutcomesOperations.updateOutcomeOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_OUTCOME": {
      RemoveOutcomeInputSchema().parse(action.input);

      problemSheetOutcomesOperations.removeOutcomeOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REORDER_OUTCOMES": {
      ReorderOutcomesInputSchema().parse(action.input);

      problemSheetOutcomesOperations.reorderOutcomesOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_OUTCOME_METRIC": {
      ClearOutcomeMetricInputSchema().parse(action.input);

      problemSheetOutcomesOperations.clearOutcomeMetricOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_OUTCOME_ROLE": {
      ClearOutcomeRoleInputSchema().parse(action.input);

      problemSheetOutcomesOperations.clearOutcomeRoleOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_OUTCOME_STEP": {
      ClearOutcomeStepInputSchema().parse(action.input);

      problemSheetOutcomesOperations.clearOutcomeStepOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_CONSTRAINT": {
      AddConstraintInputSchema().parse(action.input);

      problemSheetConstraintsOperations.addConstraintOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_CONSTRAINT": {
      UpdateConstraintInputSchema().parse(action.input);

      problemSheetConstraintsOperations.updateConstraintOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_CONSTRAINT": {
      RemoveConstraintInputSchema().parse(action.input);

      problemSheetConstraintsOperations.removeConstraintOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REORDER_CONSTRAINTS": {
      ReorderConstraintsInputSchema().parse(action.input);

      problemSheetConstraintsOperations.reorderConstraintsOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_READY_FOR_FEEDBACK": {
      SetReadyForFeedbackInputSchema().parse(action.input);

      problemSheetAgentFeedbackOperations.setReadyForFeedbackOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_SUGGESTION": {
      AddSuggestionInputSchema().parse(action.input);

      problemSheetAgentFeedbackOperations.addSuggestionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "RESOLVE_SUGGESTION": {
      ResolveSuggestionInputSchema().parse(action.input);

      problemSheetAgentFeedbackOperations.resolveSuggestionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_SUGGESTION": {
      RemoveSuggestionInputSchema().parse(action.input);

      problemSheetAgentFeedbackOperations.removeSuggestionOperation(
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

export const reducer: Reducer<ProblemSheetPHState> =
  createReducer(stateReducer);
