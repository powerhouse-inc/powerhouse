/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { WorkflowPHState } from "document-models/workflow/v1";

import { workflowEdgesOperations } from "../src/reducers/edges.js";
import { workflowPolicyOperations } from "../src/reducers/policy.js";
import { workflowRuntimeOperations } from "../src/reducers/runtime.js";
import { workflowStepsOperations } from "../src/reducers/steps.js";
import { workflowTriggerOperations } from "../src/reducers/trigger.js";
import { workflowVariablesOperations } from "../src/reducers/variables.js";
import { workflowWorkflowOperations } from "../src/reducers/workflow.js";

import {
  AddEdgeInputSchema,
  AddStepInputSchema,
  ClearTriggerInputSchema,
  RemoveEdgeInputSchema,
  RemoveStepInputSchema,
  RemoveVariableInputSchema,
  SetLastRunInputSchema,
  SetPolicyInputSchema,
  SetStepConfigInputSchema,
  SetTriggerInputSchema,
  SetVariableInputSchema,
  SetWorkflowDescriptionInputSchema,
  SetWorkflowNameInputSchema,
  SetWorkflowStatusInputSchema,
  UpdateStepInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<WorkflowPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "SET_WORKFLOW_NAME": {
      SetWorkflowNameInputSchema().parse(action.input);

      workflowWorkflowOperations.setWorkflowNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_WORKFLOW_DESCRIPTION": {
      SetWorkflowDescriptionInputSchema().parse(action.input);

      workflowWorkflowOperations.setWorkflowDescriptionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_WORKFLOW_STATUS": {
      SetWorkflowStatusInputSchema().parse(action.input);

      workflowWorkflowOperations.setWorkflowStatusOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_TRIGGER": {
      SetTriggerInputSchema().parse(action.input);

      workflowTriggerOperations.setTriggerOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_TRIGGER": {
      ClearTriggerInputSchema().parse(action.input);

      workflowTriggerOperations.clearTriggerOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_STEP": {
      AddStepInputSchema().parse(action.input);

      workflowStepsOperations.addStepOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_STEP": {
      UpdateStepInputSchema().parse(action.input);

      workflowStepsOperations.updateStepOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_STEP": {
      RemoveStepInputSchema().parse(action.input);

      workflowStepsOperations.removeStepOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_STEP_CONFIG": {
      SetStepConfigInputSchema().parse(action.input);

      workflowStepsOperations.setStepConfigOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_EDGE": {
      AddEdgeInputSchema().parse(action.input);

      workflowEdgesOperations.addEdgeOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_EDGE": {
      RemoveEdgeInputSchema().parse(action.input);

      workflowEdgesOperations.removeEdgeOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_VARIABLE": {
      SetVariableInputSchema().parse(action.input);

      workflowVariablesOperations.setVariableOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_VARIABLE": {
      RemoveVariableInputSchema().parse(action.input);

      workflowVariablesOperations.removeVariableOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_POLICY": {
      SetPolicyInputSchema().parse(action.input);

      workflowPolicyOperations.setPolicyOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_LAST_RUN": {
      SetLastRunInputSchema().parse(action.input);

      workflowRuntimeOperations.setLastRunOperation(
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

export const reducer: Reducer<WorkflowPHState> = createReducer(stateReducer);
