import type { Action } from "document-model";
import type {
  EditBillingStatementInput,
  EditBillingStatementTestInput,
  EditContributorInput,
  EditStatusInput,
} from "../types.js";

export type EditBillingStatementAction = Action & {
  type: "EDIT_BILLING_STATEMENT";
  input: EditBillingStatementInput;
};
export type EditBillingStatementTestAction = Action & {
  type: "EDIT_BILLING_STATEMENT_TEST";
  input: EditBillingStatementTestInput;
};
export type EditContributorAction = Action & {
  type: "EDIT_CONTRIBUTOR";
  input: EditContributorInput;
};
export type EditStatusAction = Action & {
  type: "EDIT_STATUS";
  input: EditStatusInput;
};

export type BillingStatementGeneralAction =
  | EditBillingStatementAction
  | EditBillingStatementTestAction
  | EditContributorAction
  | EditStatusAction;
