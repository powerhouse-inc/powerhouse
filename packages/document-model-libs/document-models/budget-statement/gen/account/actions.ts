import { BaseAction } from "document-model";
import { AddAccountInput, UpdateAccountInput, DeleteAccountInput, SortAccountsInput } from "../schema/types.js";
;

export type AddAccountAction = BaseAction<"ADD_ACCOUNT", AddAccountInput, "global">;
export type UpdateAccountAction = BaseAction<
  "UPDATE_ACCOUNT",
  UpdateAccountInput,
  "global"
>;
export type DeleteAccountAction = BaseAction<
  "DELETE_ACCOUNT",
  DeleteAccountInput,
  "global"
>;
export type SortAccountsAction = BaseAction<
  "SORT_ACCOUNTS",
  SortAccountsInput,
  "global"
>;

export type BudgetStatementAccountAction =
  | AddAccountAction
  | UpdateAccountAction
  | DeleteAccountAction
  | SortAccountsAction;
