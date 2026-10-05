/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { WorkflowPHState } from "document-models/workflow/v1";

import { workflowEdgesOperations } from "../src/reducers/edges.js";
import { workflowPolicyOperations } from "../src/reducers/policy.js";
import { workflowPublishingOperations } from "../src/reducers/publishing.js";
import { workflowRuntimeOperations } from "../src/reducers/runtime.js";
import { workflowStepsOperations } from "../src/reducers/steps.js";
import { workflowTriggerOperations } from "../src/reducers/trigger.js";
import { workflowVariablesOperations } from "../src/reducers/variables.js";
import { workflowWorkflowOperations } from "../src/reducers/workflow.js";

import {
  AddEdgeInputSchema,
  AddStepInputSchema,
  ClearTriggerInputSchema,
  PublishWorkflowInputSchema,
  RemoveEdgeInputSchema,
  RemoveStepInputSchema,
  RemoveVariableInputSchema,
  RevertToPublishedInputSchema,
  SetLastRunInputSchema,
  SetLastTestInputSchema,
  SetPolicyInputSchema,
  SetStepConfigInputSchema,
  SetTriggerInputSchema,
  SetVariableInputSchema,
  SetWorkflowDescriptionInputSchema,
  SetWorkflowNameInputSchema,
  SetWorkflowStatusInputSchema,
  UpdateStepInputSchema,
} from "./schema/zod.js";

const schemaMemo = new Map<() => unknown, unknown>();

function memoizedSchema<T>(makeSchema: () => T): T {
  let schema = schemaMemo.get(makeSchema) as T | undefined;
  if (schema === undefined) {
    schema = makeSchema();
    schemaMemo.set(makeSchema, schema);
  }
  return schema;
}

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
      memoizedSchema(SetWorkflowNameInputSchema).parse(action.input);

      workflowWorkflowOperations.setWorkflowNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_WORKFLOW_DESCRIPTION": {
      memoizedSchema(SetWorkflowDescriptionInputSchema).parse(action.input);

      workflowWorkflowOperations.setWorkflowDescriptionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_WORKFLOW_STATUS": {
      memoizedSchema(SetWorkflowStatusInputSchema).parse(action.input);

      workflowWorkflowOperations.setWorkflowStatusOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_TRIGGER": {
      memoizedSchema(SetTriggerInputSchema).parse(action.input);

      workflowTriggerOperations.setTriggerOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_TRIGGER": {
      memoizedSchema(ClearTriggerInputSchema).parse(action.input);

      workflowTriggerOperations.clearTriggerOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_STEP": {
      memoizedSchema(AddStepInputSchema).parse(action.input);

      workflowStepsOperations.addStepOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_STEP": {
      memoizedSchema(UpdateStepInputSchema).parse(action.input);

      workflowStepsOperations.updateStepOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_STEP": {
      memoizedSchema(RemoveStepInputSchema).parse(action.input);

      workflowStepsOperations.removeStepOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_STEP_CONFIG": {
      memoizedSchema(SetStepConfigInputSchema).parse(action.input);

      workflowStepsOperations.setStepConfigOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_EDGE": {
      memoizedSchema(AddEdgeInputSchema).parse(action.input);

      workflowEdgesOperations.addEdgeOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_EDGE": {
      memoizedSchema(RemoveEdgeInputSchema).parse(action.input);

      workflowEdgesOperations.removeEdgeOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_VARIABLE": {
      memoizedSchema(SetVariableInputSchema).parse(action.input);

      workflowVariablesOperations.setVariableOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_VARIABLE": {
      memoizedSchema(RemoveVariableInputSchema).parse(action.input);

      workflowVariablesOperations.removeVariableOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_POLICY": {
      memoizedSchema(SetPolicyInputSchema).parse(action.input);

      workflowPolicyOperations.setPolicyOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_LAST_RUN": {
      memoizedSchema(SetLastRunInputSchema).parse(action.input);

      workflowRuntimeOperations.setLastRunOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_LAST_TEST": {
      memoizedSchema(SetLastTestInputSchema).parse(action.input);

      workflowRuntimeOperations.setLastTestOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "PUBLISH_WORKFLOW": {
      memoizedSchema(PublishWorkflowInputSchema).parse(action.input);

      workflowPublishingOperations.publishWorkflowOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REVERT_TO_PUBLISHED": {
      memoizedSchema(RevertToPublishedInputSchema).parse(action.input);

      workflowPublishingOperations.revertToPublishedOperation(
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
