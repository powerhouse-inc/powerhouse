import { Action } from "document-model/document";
import {
  AddAccountInput,
  UpdateAccountInput,
  DeleteAccountInput,
  SortAccountsInput,
} from "../types";

export type AddAccountAction = Action<"ADD_ACCOUNT", AddAccountInput, "global">;
export type UpdateAccountAction = Action<
  "UPDATE_ACCOUNT",
  UpdateAccountInput,
  "global"
>;
export type DeleteAccountAction = Action<
  "DELETE_ACCOUNT",
  DeleteAccountInput,
  "global"
>;
export type SortAccountsAction = Action<
  "SORT_ACCOUNTS",
  SortAccountsInput,
  "global"
>;

export type BudgetStatementAccountAction =
  | AddAccountAction
  | UpdateAccountAction
  | DeleteAccountAction
  | SortAccountsAction;
