import { type SignalDispatch } from "document-model";
import type {
  EditBillingStatementAction,
  EditContributorAction,
  EditStatusAction,
} from "./actions.js";
import type { BillingStatementState } from "../types.js";

export interface BillingStatementGeneralOperations {
  editBillingStatementOperation: (
    state: BillingStatementState,
    action: EditBillingStatementAction,
    dispatch?: SignalDispatch,
  ) => void;
  editContributorOperation: (
    state: BillingStatementState,
    action: EditContributorAction,
    dispatch?: SignalDispatch,
  ) => void;
  editStatusOperation: (
    state: BillingStatementState,
    action: EditStatusAction,
    dispatch?: SignalDispatch,
  ) => void;
}
