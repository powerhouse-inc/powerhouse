/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AcceptTaskInputSchema,
  AddTaskDependencyInputSchema,
  AddTaskInputSchema,
  AddTaskOutcomeRefInputSchema,
  AssignTaskInputSchema,
  BlockTaskInputSchema,
  ClearTaskParentFeatureInputSchema,
  ClearTaskPlannedInInputSchema,
  ClearTaskTargetSpecInputSchema,
  DropTaskInputSchema,
  MoveTaskInputSchema,
  RejectTaskInputSchema,
  RemoveTaskDependencyInputSchema,
  RemoveTaskInputSchema,
  RemoveTaskOutcomeRefInputSchema,
  ReorderTaskOutcomeRefsInputSchema,
  ReorderTasksInputSchema,
  SetTaskParentFeatureInputSchema,
  SetTaskPlannedInInputSchema,
  SetTaskTargetSpecInputSchema,
  SubmitTaskForReviewInputSchema,
  UnassignTaskInputSchema,
  UnblockTaskInputSchema,
  UpdateTaskDependencySnippetInputSchema,
  UpdateTaskInputSchema,
  UpdateTaskOutcomeRefSnippetInputSchema,
  UpdateTaskParentFeatureSnippetInputSchema,
  UpdateTaskPlannedInSnippetInputSchema,
  UpdateTaskSessionSnippetInputSchema,
  UpdateTaskTargetSpecSnippetInputSchema,
} from "../schema/zod.js";
import type {
  AcceptTaskInput,
  AddTaskDependencyInput,
  AddTaskInput,
  AddTaskOutcomeRefInput,
  AssignTaskInput,
  BlockTaskInput,
  ClearTaskParentFeatureInput,
  ClearTaskPlannedInInput,
  ClearTaskTargetSpecInput,
  DropTaskInput,
  MoveTaskInput,
  RejectTaskInput,
  RemoveTaskDependencyInput,
  RemoveTaskInput,
  RemoveTaskOutcomeRefInput,
  ReorderTaskOutcomeRefsInput,
  ReorderTasksInput,
  SetTaskParentFeatureInput,
  SetTaskPlannedInInput,
  SetTaskTargetSpecInput,
  SubmitTaskForReviewInput,
  UnassignTaskInput,
  UnblockTaskInput,
  UpdateTaskDependencySnippetInput,
  UpdateTaskInput,
  UpdateTaskOutcomeRefSnippetInput,
  UpdateTaskParentFeatureSnippetInput,
  UpdateTaskPlannedInSnippetInput,
  UpdateTaskSessionSnippetInput,
  UpdateTaskTargetSpecSnippetInput,
} from "../types.js";
import type {
  AcceptTaskAction,
  AddTaskAction,
  AddTaskDependencyAction,
  AddTaskOutcomeRefAction,
  AssignTaskAction,
  BlockTaskAction,
  ClearTaskParentFeatureAction,
  ClearTaskPlannedInAction,
  ClearTaskTargetSpecAction,
  DropTaskAction,
  MoveTaskAction,
  RejectTaskAction,
  RemoveTaskAction,
  RemoveTaskDependencyAction,
  RemoveTaskOutcomeRefAction,
  ReorderTaskOutcomeRefsAction,
  ReorderTasksAction,
  SetTaskParentFeatureAction,
  SetTaskPlannedInAction,
  SetTaskTargetSpecAction,
  SubmitTaskForReviewAction,
  UnassignTaskAction,
  UnblockTaskAction,
  UpdateTaskAction,
  UpdateTaskDependencySnippetAction,
  UpdateTaskOutcomeRefSnippetAction,
  UpdateTaskParentFeatureSnippetAction,
  UpdateTaskPlannedInSnippetAction,
  UpdateTaskSessionSnippetAction,
  UpdateTaskTargetSpecSnippetAction,
} from "./actions.js";

export const addTask = (input: AddTaskInput) =>
  createAction<AddTaskAction>(
    "ADD_TASK",
    { ...input },
    undefined,
    AddTaskInputSchema,
    "global",
  );

export const updateTask = (input: UpdateTaskInput) =>
  createAction<UpdateTaskAction>(
    "UPDATE_TASK",
    { ...input },
    undefined,
    UpdateTaskInputSchema,
    "global",
  );

export const moveTask = (input: MoveTaskInput) =>
  createAction<MoveTaskAction>(
    "MOVE_TASK",
    { ...input },
    undefined,
    MoveTaskInputSchema,
    "global",
  );

export const reorderTasks = (input: ReorderTasksInput) =>
  createAction<ReorderTasksAction>(
    "REORDER_TASKS",
    { ...input },
    undefined,
    ReorderTasksInputSchema,
    "global",
  );

export const removeTask = (input: RemoveTaskInput) =>
  createAction<RemoveTaskAction>(
    "REMOVE_TASK",
    { ...input },
    undefined,
    RemoveTaskInputSchema,
    "global",
  );

export const setTaskTargetSpec = (input: SetTaskTargetSpecInput) =>
  createAction<SetTaskTargetSpecAction>(
    "SET_TASK_TARGET_SPEC",
    { ...input },
    undefined,
    SetTaskTargetSpecInputSchema,
    "global",
  );

export const updateTaskTargetSpecSnippet = (
  input: UpdateTaskTargetSpecSnippetInput,
) =>
  createAction<UpdateTaskTargetSpecSnippetAction>(
    "UPDATE_TASK_TARGET_SPEC_SNIPPET",
    { ...input },
    undefined,
    UpdateTaskTargetSpecSnippetInputSchema,
    "global",
  );

export const clearTaskTargetSpec = (input: ClearTaskTargetSpecInput) =>
  createAction<ClearTaskTargetSpecAction>(
    "CLEAR_TASK_TARGET_SPEC",
    { ...input },
    undefined,
    ClearTaskTargetSpecInputSchema,
    "global",
  );

export const setTaskParentFeature = (input: SetTaskParentFeatureInput) =>
  createAction<SetTaskParentFeatureAction>(
    "SET_TASK_PARENT_FEATURE",
    { ...input },
    undefined,
    SetTaskParentFeatureInputSchema,
    "global",
  );

export const updateTaskParentFeatureSnippet = (
  input: UpdateTaskParentFeatureSnippetInput,
) =>
  createAction<UpdateTaskParentFeatureSnippetAction>(
    "UPDATE_TASK_PARENT_FEATURE_SNIPPET",
    { ...input },
    undefined,
    UpdateTaskParentFeatureSnippetInputSchema,
    "global",
  );

export const clearTaskParentFeature = (input: ClearTaskParentFeatureInput) =>
  createAction<ClearTaskParentFeatureAction>(
    "CLEAR_TASK_PARENT_FEATURE",
    { ...input },
    undefined,
    ClearTaskParentFeatureInputSchema,
    "global",
  );

export const setTaskPlannedIn = (input: SetTaskPlannedInInput) =>
  createAction<SetTaskPlannedInAction>(
    "SET_TASK_PLANNED_IN",
    { ...input },
    undefined,
    SetTaskPlannedInInputSchema,
    "global",
  );

export const updateTaskPlannedInSnippet = (
  input: UpdateTaskPlannedInSnippetInput,
) =>
  createAction<UpdateTaskPlannedInSnippetAction>(
    "UPDATE_TASK_PLANNED_IN_SNIPPET",
    { ...input },
    undefined,
    UpdateTaskPlannedInSnippetInputSchema,
    "global",
  );

export const clearTaskPlannedIn = (input: ClearTaskPlannedInInput) =>
  createAction<ClearTaskPlannedInAction>(
    "CLEAR_TASK_PLANNED_IN",
    { ...input },
    undefined,
    ClearTaskPlannedInInputSchema,
    "global",
  );

export const addTaskOutcomeRef = (input: AddTaskOutcomeRefInput) =>
  createAction<AddTaskOutcomeRefAction>(
    "ADD_TASK_OUTCOME_REF",
    { ...input },
    undefined,
    AddTaskOutcomeRefInputSchema,
    "global",
  );

export const updateTaskOutcomeRefSnippet = (
  input: UpdateTaskOutcomeRefSnippetInput,
) =>
  createAction<UpdateTaskOutcomeRefSnippetAction>(
    "UPDATE_TASK_OUTCOME_REF_SNIPPET",
    { ...input },
    undefined,
    UpdateTaskOutcomeRefSnippetInputSchema,
    "global",
  );

export const removeTaskOutcomeRef = (input: RemoveTaskOutcomeRefInput) =>
  createAction<RemoveTaskOutcomeRefAction>(
    "REMOVE_TASK_OUTCOME_REF",
    { ...input },
    undefined,
    RemoveTaskOutcomeRefInputSchema,
    "global",
  );

export const reorderTaskOutcomeRefs = (input: ReorderTaskOutcomeRefsInput) =>
  createAction<ReorderTaskOutcomeRefsAction>(
    "REORDER_TASK_OUTCOME_REFS",
    { ...input },
    undefined,
    ReorderTaskOutcomeRefsInputSchema,
    "global",
  );

export const addTaskDependency = (input: AddTaskDependencyInput) =>
  createAction<AddTaskDependencyAction>(
    "ADD_TASK_DEPENDENCY",
    { ...input },
    undefined,
    AddTaskDependencyInputSchema,
    "global",
  );

export const updateTaskDependencySnippet = (
  input: UpdateTaskDependencySnippetInput,
) =>
  createAction<UpdateTaskDependencySnippetAction>(
    "UPDATE_TASK_DEPENDENCY_SNIPPET",
    { ...input },
    undefined,
    UpdateTaskDependencySnippetInputSchema,
    "global",
  );

export const removeTaskDependency = (input: RemoveTaskDependencyInput) =>
  createAction<RemoveTaskDependencyAction>(
    "REMOVE_TASK_DEPENDENCY",
    { ...input },
    undefined,
    RemoveTaskDependencyInputSchema,
    "global",
  );

export const assignTask = (input: AssignTaskInput) =>
  createAction<AssignTaskAction>(
    "ASSIGN_TASK",
    { ...input },
    undefined,
    AssignTaskInputSchema,
    "global",
  );

export const updateTaskSessionSnippet = (
  input: UpdateTaskSessionSnippetInput,
) =>
  createAction<UpdateTaskSessionSnippetAction>(
    "UPDATE_TASK_SESSION_SNIPPET",
    { ...input },
    undefined,
    UpdateTaskSessionSnippetInputSchema,
    "global",
  );

export const unassignTask = (input: UnassignTaskInput) =>
  createAction<UnassignTaskAction>(
    "UNASSIGN_TASK",
    { ...input },
    undefined,
    UnassignTaskInputSchema,
    "global",
  );

export const submitTaskForReview = (input: SubmitTaskForReviewInput) =>
  createAction<SubmitTaskForReviewAction>(
    "SUBMIT_TASK_FOR_REVIEW",
    { ...input },
    undefined,
    SubmitTaskForReviewInputSchema,
    "global",
  );

export const acceptTask = (input: AcceptTaskInput) =>
  createAction<AcceptTaskAction>(
    "ACCEPT_TASK",
    { ...input },
    undefined,
    AcceptTaskInputSchema,
    "global",
  );

export const rejectTask = (input: RejectTaskInput) =>
  createAction<RejectTaskAction>(
    "REJECT_TASK",
    { ...input },
    undefined,
    RejectTaskInputSchema,
    "global",
  );

export const blockTask = (input: BlockTaskInput) =>
  createAction<BlockTaskAction>(
    "BLOCK_TASK",
    { ...input },
    undefined,
    BlockTaskInputSchema,
    "global",
  );

export const unblockTask = (input: UnblockTaskInput) =>
  createAction<UnblockTaskAction>(
    "UNBLOCK_TASK",
    { ...input },
    undefined,
    UnblockTaskInputSchema,
    "global",
  );

export const dropTask = (input: DropTaskInput) =>
  createAction<DropTaskAction>(
    "DROP_TASK",
    { ...input },
    undefined,
    DropTaskInputSchema,
    "global",
  );
