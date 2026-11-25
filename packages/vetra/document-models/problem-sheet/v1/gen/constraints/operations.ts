/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { ProblemSheetGlobalState } from "../types.js";
import type {
  AddConstraintAction,
  RemoveConstraintAction,
  ReorderConstraintsAction,
  UpdateConstraintAction,
} from "./actions.js";

export interface ProblemSheetConstraintsOperations {
  addConstraintOperation: (
    state: ProblemSheetGlobalState,
    action: AddConstraintAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateConstraintOperation: (
    state: ProblemSheetGlobalState,
    action: UpdateConstraintAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeConstraintOperation: (
    state: ProblemSheetGlobalState,
    action: RemoveConstraintAction,
    dispatch?: SignalDispatch,
  ) => void;
  reorderConstraintsOperation: (
    state: ProblemSheetGlobalState,
    action: ReorderConstraintsAction,
    dispatch?: SignalDispatch,
  ) => void;
}
