/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { ProblemSheetGlobalState } from "../types.js";
import type {
  AddRoleAction,
  AddSpecializedJobStepAction,
  ClearRoleSpecializedJobAction,
  RemoveRoleAction,
  RemoveSpecializedJobStepAction,
  ReorderRolesAction,
  ReorderSpecializedJobStepsAction,
  SetRoleSpecializedJobAction,
  UpdateRoleAction,
  UpdateRoleSpecializedJobAction,
  UpdateSpecializedJobStepAction,
} from "./actions.js";

export interface ProblemSheetRolesOperations {
  addRoleOperation: (
    state: ProblemSheetGlobalState,
    action: AddRoleAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateRoleOperation: (
    state: ProblemSheetGlobalState,
    action: UpdateRoleAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeRoleOperation: (
    state: ProblemSheetGlobalState,
    action: RemoveRoleAction,
    dispatch?: SignalDispatch,
  ) => void;
  reorderRolesOperation: (
    state: ProblemSheetGlobalState,
    action: ReorderRolesAction,
    dispatch?: SignalDispatch,
  ) => void;
  setRoleSpecializedJobOperation: (
    state: ProblemSheetGlobalState,
    action: SetRoleSpecializedJobAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateRoleSpecializedJobOperation: (
    state: ProblemSheetGlobalState,
    action: UpdateRoleSpecializedJobAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearRoleSpecializedJobOperation: (
    state: ProblemSheetGlobalState,
    action: ClearRoleSpecializedJobAction,
    dispatch?: SignalDispatch,
  ) => void;
  addSpecializedJobStepOperation: (
    state: ProblemSheetGlobalState,
    action: AddSpecializedJobStepAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateSpecializedJobStepOperation: (
    state: ProblemSheetGlobalState,
    action: UpdateSpecializedJobStepAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeSpecializedJobStepOperation: (
    state: ProblemSheetGlobalState,
    action: RemoveSpecializedJobStepAction,
    dispatch?: SignalDispatch,
  ) => void;
  reorderSpecializedJobStepsOperation: (
    state: ProblemSheetGlobalState,
    action: ReorderSpecializedJobStepsAction,
    dispatch?: SignalDispatch,
  ) => void;
}
