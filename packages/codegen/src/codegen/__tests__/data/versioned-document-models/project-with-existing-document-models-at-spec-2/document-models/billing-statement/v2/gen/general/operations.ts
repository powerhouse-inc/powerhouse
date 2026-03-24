import { type SignalDispatch } from "document-model";
import type { BillingStatementState } from "../types.js";
import type {
    EditBillingStatementAction,
    EditBillingStatementTestAction,
    EditContributorAction,
    EditStatusAction,
} from "./actions.js";

export interface BillingStatementGeneralOperations {
  editBillingStatementTestOperation: (
    state: BillingStatementState,
    action: EditBillingStatementTestAction,
    dispatch?: SignalDispatch,
  ) => void;
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
