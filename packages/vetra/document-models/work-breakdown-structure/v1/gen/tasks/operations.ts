/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { WorkBreakdownStructureGlobalState } from "../types.js";
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

export interface WorkBreakdownStructureTasksOperations {
  addTaskOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: AddTaskAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateTaskOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: UpdateTaskAction,
    dispatch?: SignalDispatch,
  ) => void;
  moveTaskOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: MoveTaskAction,
    dispatch?: SignalDispatch,
  ) => void;
  reorderTasksOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: ReorderTasksAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeTaskOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: RemoveTaskAction,
    dispatch?: SignalDispatch,
  ) => void;
  setTaskTargetSpecOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: SetTaskTargetSpecAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateTaskTargetSpecSnippetOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: UpdateTaskTargetSpecSnippetAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearTaskTargetSpecOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: ClearTaskTargetSpecAction,
    dispatch?: SignalDispatch,
  ) => void;
  setTaskParentFeatureOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: SetTaskParentFeatureAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateTaskParentFeatureSnippetOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: UpdateTaskParentFeatureSnippetAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearTaskParentFeatureOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: ClearTaskParentFeatureAction,
    dispatch?: SignalDispatch,
  ) => void;
  setTaskPlannedInOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: SetTaskPlannedInAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateTaskPlannedInSnippetOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: UpdateTaskPlannedInSnippetAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearTaskPlannedInOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: ClearTaskPlannedInAction,
    dispatch?: SignalDispatch,
  ) => void;
  addTaskOutcomeRefOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: AddTaskOutcomeRefAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateTaskOutcomeRefSnippetOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: UpdateTaskOutcomeRefSnippetAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeTaskOutcomeRefOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: RemoveTaskOutcomeRefAction,
    dispatch?: SignalDispatch,
  ) => void;
  reorderTaskOutcomeRefsOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: ReorderTaskOutcomeRefsAction,
    dispatch?: SignalDispatch,
  ) => void;
  addTaskDependencyOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: AddTaskDependencyAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateTaskDependencySnippetOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: UpdateTaskDependencySnippetAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeTaskDependencyOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: RemoveTaskDependencyAction,
    dispatch?: SignalDispatch,
  ) => void;
  assignTaskOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: AssignTaskAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateTaskSessionSnippetOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: UpdateTaskSessionSnippetAction,
    dispatch?: SignalDispatch,
  ) => void;
  unassignTaskOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: UnassignTaskAction,
    dispatch?: SignalDispatch,
  ) => void;
  submitTaskForReviewOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: SubmitTaskForReviewAction,
    dispatch?: SignalDispatch,
  ) => void;
  acceptTaskOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: AcceptTaskAction,
    dispatch?: SignalDispatch,
  ) => void;
  rejectTaskOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: RejectTaskAction,
    dispatch?: SignalDispatch,
  ) => void;
  blockTaskOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: BlockTaskAction,
    dispatch?: SignalDispatch,
  ) => void;
  unblockTaskOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: UnblockTaskAction,
    dispatch?: SignalDispatch,
  ) => void;
  dropTaskOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: DropTaskAction,
    dispatch?: SignalDispatch,
  ) => void;
}
