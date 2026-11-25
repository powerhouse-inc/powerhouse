/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { WorkBreakdownStructurePHState } from "document-models/work-breakdown-structure/v1";

import { workBreakdownStructurePackagesOperations } from "../src/reducers/packages.js";
import { workBreakdownStructureTasksOperations } from "../src/reducers/tasks.js";
import { workBreakdownStructureWbsMetaOperations } from "../src/reducers/wbs-meta.js";
import { workBreakdownStructureWbsStatusOperations } from "../src/reducers/wbs-status.js";

import {
  AcceptTaskInputSchema,
  ActivateWbsInputSchema,
  AddPackageInputSchema,
  AddTaskDependencyInputSchema,
  AddTaskInputSchema,
  AddTaskOutcomeRefInputSchema,
  ArchiveWbsInputSchema,
  AssignTaskInputSchema,
  BlockTaskInputSchema,
  ClearFeatureInputSchema,
  ClearTaskParentFeatureInputSchema,
  ClearTaskPlannedInInputSchema,
  ClearTaskTargetSpecInputSchema,
  ClearWbsDescriptionInputSchema,
  ClearWbsNameInputSchema,
  CompleteWbsInputSchema,
  DropTaskInputSchema,
  MovePackageInputSchema,
  MoveTaskInputSchema,
  RejectTaskInputSchema,
  RemovePackageInputSchema,
  RemoveTaskDependencyInputSchema,
  RemoveTaskInputSchema,
  RemoveTaskOutcomeRefInputSchema,
  ReopenWbsInputSchema,
  ReorderPackagesInputSchema,
  ReorderTaskOutcomeRefsInputSchema,
  ReorderTasksInputSchema,
  SetFeatureInputSchema,
  SetTaskParentFeatureInputSchema,
  SetTaskPlannedInInputSchema,
  SetTaskTargetSpecInputSchema,
  SetWbsDescriptionInputSchema,
  SetWbsNameInputSchema,
  SubmitTaskForReviewInputSchema,
  UnassignTaskInputSchema,
  UnblockTaskInputSchema,
  UpdateFeatureSnippetInputSchema,
  UpdatePackageInputSchema,
  UpdateTaskDependencySnippetInputSchema,
  UpdateTaskInputSchema,
  UpdateTaskOutcomeRefSnippetInputSchema,
  UpdateTaskParentFeatureSnippetInputSchema,
  UpdateTaskPlannedInSnippetInputSchema,
  UpdateTaskSessionSnippetInputSchema,
  UpdateTaskTargetSpecSnippetInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<WorkBreakdownStructurePHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "SET_WBS_NAME": {
      SetWbsNameInputSchema().parse(action.input);

      workBreakdownStructureWbsMetaOperations.setWbsNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_WBS_NAME": {
      ClearWbsNameInputSchema().parse(action.input);

      workBreakdownStructureWbsMetaOperations.clearWbsNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_WBS_DESCRIPTION": {
      SetWbsDescriptionInputSchema().parse(action.input);

      workBreakdownStructureWbsMetaOperations.setWbsDescriptionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_WBS_DESCRIPTION": {
      ClearWbsDescriptionInputSchema().parse(action.input);

      workBreakdownStructureWbsMetaOperations.clearWbsDescriptionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_FEATURE": {
      SetFeatureInputSchema().parse(action.input);

      workBreakdownStructureWbsMetaOperations.setFeatureOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_FEATURE_SNIPPET": {
      UpdateFeatureSnippetInputSchema().parse(action.input);

      workBreakdownStructureWbsMetaOperations.updateFeatureSnippetOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_FEATURE": {
      ClearFeatureInputSchema().parse(action.input);

      workBreakdownStructureWbsMetaOperations.clearFeatureOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ACTIVATE_WBS": {
      ActivateWbsInputSchema().parse(action.input);

      workBreakdownStructureWbsStatusOperations.activateWbsOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "COMPLETE_WBS": {
      CompleteWbsInputSchema().parse(action.input);

      workBreakdownStructureWbsStatusOperations.completeWbsOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ARCHIVE_WBS": {
      ArchiveWbsInputSchema().parse(action.input);

      workBreakdownStructureWbsStatusOperations.archiveWbsOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REOPEN_WBS": {
      ReopenWbsInputSchema().parse(action.input);

      workBreakdownStructureWbsStatusOperations.reopenWbsOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_PACKAGE": {
      AddPackageInputSchema().parse(action.input);

      workBreakdownStructurePackagesOperations.addPackageOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_PACKAGE": {
      UpdatePackageInputSchema().parse(action.input);

      workBreakdownStructurePackagesOperations.updatePackageOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "MOVE_PACKAGE": {
      MovePackageInputSchema().parse(action.input);

      workBreakdownStructurePackagesOperations.movePackageOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_PACKAGE": {
      RemovePackageInputSchema().parse(action.input);

      workBreakdownStructurePackagesOperations.removePackageOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REORDER_PACKAGES": {
      ReorderPackagesInputSchema().parse(action.input);

      workBreakdownStructurePackagesOperations.reorderPackagesOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_TASK": {
      AddTaskInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.addTaskOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_TASK": {
      UpdateTaskInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.updateTaskOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "MOVE_TASK": {
      MoveTaskInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.moveTaskOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REORDER_TASKS": {
      ReorderTasksInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.reorderTasksOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_TASK": {
      RemoveTaskInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.removeTaskOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_TASK_TARGET_SPEC": {
      SetTaskTargetSpecInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.setTaskTargetSpecOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_TASK_TARGET_SPEC_SNIPPET": {
      UpdateTaskTargetSpecSnippetInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.updateTaskTargetSpecSnippetOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_TASK_TARGET_SPEC": {
      ClearTaskTargetSpecInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.clearTaskTargetSpecOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_TASK_PARENT_FEATURE": {
      SetTaskParentFeatureInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.setTaskParentFeatureOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_TASK_PARENT_FEATURE_SNIPPET": {
      UpdateTaskParentFeatureSnippetInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.updateTaskParentFeatureSnippetOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_TASK_PARENT_FEATURE": {
      ClearTaskParentFeatureInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.clearTaskParentFeatureOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_TASK_PLANNED_IN": {
      SetTaskPlannedInInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.setTaskPlannedInOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_TASK_PLANNED_IN_SNIPPET": {
      UpdateTaskPlannedInSnippetInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.updateTaskPlannedInSnippetOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_TASK_PLANNED_IN": {
      ClearTaskPlannedInInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.clearTaskPlannedInOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_TASK_OUTCOME_REF": {
      AddTaskOutcomeRefInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.addTaskOutcomeRefOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_TASK_OUTCOME_REF_SNIPPET": {
      UpdateTaskOutcomeRefSnippetInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.updateTaskOutcomeRefSnippetOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_TASK_OUTCOME_REF": {
      RemoveTaskOutcomeRefInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.removeTaskOutcomeRefOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REORDER_TASK_OUTCOME_REFS": {
      ReorderTaskOutcomeRefsInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.reorderTaskOutcomeRefsOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_TASK_DEPENDENCY": {
      AddTaskDependencyInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.addTaskDependencyOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_TASK_DEPENDENCY_SNIPPET": {
      UpdateTaskDependencySnippetInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.updateTaskDependencySnippetOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_TASK_DEPENDENCY": {
      RemoveTaskDependencyInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.removeTaskDependencyOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ASSIGN_TASK": {
      AssignTaskInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.assignTaskOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_TASK_SESSION_SNIPPET": {
      UpdateTaskSessionSnippetInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.updateTaskSessionSnippetOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UNASSIGN_TASK": {
      UnassignTaskInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.unassignTaskOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SUBMIT_TASK_FOR_REVIEW": {
      SubmitTaskForReviewInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.submitTaskForReviewOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ACCEPT_TASK": {
      AcceptTaskInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.acceptTaskOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REJECT_TASK": {
      RejectTaskInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.rejectTaskOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "BLOCK_TASK": {
      BlockTaskInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.blockTaskOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UNBLOCK_TASK": {
      UnblockTaskInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.unblockTaskOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "DROP_TASK": {
      DropTaskInputSchema().parse(action.input);

      workBreakdownStructureTasksOperations.dropTaskOperation(
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

export const reducer: Reducer<WorkBreakdownStructurePHState> =
  createReducer(stateReducer);
