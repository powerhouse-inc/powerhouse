import { SignalDispatch } from "document-model";
import {
    AddVestingAction,
    UpdateVestingAction,
    DeleteVestingAction,
} from "./actions.js";
import { BudgetStatementState } from "../types.js";

export interface BudgetStatementVestingOperations {
  addVestingOperation: (
    state: BudgetStatementState,
    action: AddVestingAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateVestingOperation: (
    state: BudgetStatementState,
    action: UpdateVestingAction,
    dispatch?: SignalDispatch,
  ) => void;
  deleteVestingOperation: (
    state: BudgetStatementState,
    action: DeleteVestingAction,
    dispatch?: SignalDispatch,
  ) => void;
}
