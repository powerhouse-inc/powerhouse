import { SignalDispatch } from "document-model/document";
import {
  AddVestingAction,
  UpdateVestingAction,
  DeleteVestingAction,
} from "./actions";
import { BudgetStatementState } from "../types";

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
