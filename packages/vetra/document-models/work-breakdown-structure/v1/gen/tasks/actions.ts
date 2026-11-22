/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
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

export type AddTaskAction = Action & { type: "ADD_TASK"; input: AddTaskInput };
export type UpdateTaskAction = Action & {
  type: "UPDATE_TASK";
  input: UpdateTaskInput;
};
export type MoveTaskAction = Action & {
  type: "MOVE_TASK";
  input: MoveTaskInput;
};
export type ReorderTasksAction = Action & {
  type: "REORDER_TASKS";
  input: ReorderTasksInput;
};
export type RemoveTaskAction = Action & {
  type: "REMOVE_TASK";
  input: RemoveTaskInput;
};
export type SetTaskTargetSpecAction = Action & {
  type: "SET_TASK_TARGET_SPEC";
  input: SetTaskTargetSpecInput;
};
export type UpdateTaskTargetSpecSnippetAction = Action & {
  type: "UPDATE_TASK_TARGET_SPEC_SNIPPET";
  input: UpdateTaskTargetSpecSnippetInput;
};
export type ClearTaskTargetSpecAction = Action & {
  type: "CLEAR_TASK_TARGET_SPEC";
  input: ClearTaskTargetSpecInput;
};
export type SetTaskParentFeatureAction = Action & {
  type: "SET_TASK_PARENT_FEATURE";
  input: SetTaskParentFeatureInput;
};
export type UpdateTaskParentFeatureSnippetAction = Action & {
  type: "UPDATE_TASK_PARENT_FEATURE_SNIPPET";
  input: UpdateTaskParentFeatureSnippetInput;
};
export type ClearTaskParentFeatureAction = Action & {
  type: "CLEAR_TASK_PARENT_FEATURE";
  input: ClearTaskParentFeatureInput;
};
export type SetTaskPlannedInAction = Action & {
  type: "SET_TASK_PLANNED_IN";
  input: SetTaskPlannedInInput;
};
export type UpdateTaskPlannedInSnippetAction = Action & {
  type: "UPDATE_TASK_PLANNED_IN_SNIPPET";
  input: UpdateTaskPlannedInSnippetInput;
};
export type ClearTaskPlannedInAction = Action & {
  type: "CLEAR_TASK_PLANNED_IN";
  input: ClearTaskPlannedInInput;
};
export type AddTaskOutcomeRefAction = Action & {
  type: "ADD_TASK_OUTCOME_REF";
  input: AddTaskOutcomeRefInput;
};
export type UpdateTaskOutcomeRefSnippetAction = Action & {
  type: "UPDATE_TASK_OUTCOME_REF_SNIPPET";
  input: UpdateTaskOutcomeRefSnippetInput;
};
export type RemoveTaskOutcomeRefAction = Action & {
  type: "REMOVE_TASK_OUTCOME_REF";
  input: RemoveTaskOutcomeRefInput;
};
export type ReorderTaskOutcomeRefsAction = Action & {
  type: "REORDER_TASK_OUTCOME_REFS";
  input: ReorderTaskOutcomeRefsInput;
};
export type AddTaskDependencyAction = Action & {
  type: "ADD_TASK_DEPENDENCY";
  input: AddTaskDependencyInput;
};
export type UpdateTaskDependencySnippetAction = Action & {
  type: "UPDATE_TASK_DEPENDENCY_SNIPPET";
  input: UpdateTaskDependencySnippetInput;
};
export type RemoveTaskDependencyAction = Action & {
  type: "REMOVE_TASK_DEPENDENCY";
  input: RemoveTaskDependencyInput;
};
export type AssignTaskAction = Action & {
  type: "ASSIGN_TASK";
  input: AssignTaskInput;
};
export type UpdateTaskSessionSnippetAction = Action & {
  type: "UPDATE_TASK_SESSION_SNIPPET";
  input: UpdateTaskSessionSnippetInput;
};
export type UnassignTaskAction = Action & {
  type: "UNASSIGN_TASK";
  input: UnassignTaskInput;
};
export type SubmitTaskForReviewAction = Action & {
  type: "SUBMIT_TASK_FOR_REVIEW";
  input: SubmitTaskForReviewInput;
};
export type AcceptTaskAction = Action & {
  type: "ACCEPT_TASK";
  input: AcceptTaskInput;
};
export type RejectTaskAction = Action & {
  type: "REJECT_TASK";
  input: RejectTaskInput;
};
export type BlockTaskAction = Action & {
  type: "BLOCK_TASK";
  input: BlockTaskInput;
};
export type UnblockTaskAction = Action & {
  type: "UNBLOCK_TASK";
  input: UnblockTaskInput;
};
export type DropTaskAction = Action & {
  type: "DROP_TASK";
  input: DropTaskInput;
};

export type WorkBreakdownStructureTasksAction =
  | AddTaskAction
  | UpdateTaskAction
  | MoveTaskAction
  | ReorderTasksAction
  | RemoveTaskAction
  | SetTaskTargetSpecAction
  | UpdateTaskTargetSpecSnippetAction
  | ClearTaskTargetSpecAction
  | SetTaskParentFeatureAction
  | UpdateTaskParentFeatureSnippetAction
  | ClearTaskParentFeatureAction
  | SetTaskPlannedInAction
  | UpdateTaskPlannedInSnippetAction
  | ClearTaskPlannedInAction
  | AddTaskOutcomeRefAction
  | UpdateTaskOutcomeRefSnippetAction
  | RemoveTaskOutcomeRefAction
  | ReorderTaskOutcomeRefsAction
  | AddTaskDependencyAction
  | UpdateTaskDependencySnippetAction
  | RemoveTaskDependencyAction
  | AssignTaskAction
  | UpdateTaskSessionSnippetAction
  | UnassignTaskAction
  | SubmitTaskForReviewAction
  | AcceptTaskAction
  | RejectTaskAction
  | BlockTaskAction
  | UnblockTaskAction
  | DropTaskAction;
