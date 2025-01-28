import { Action } from "document-model/document";
import {
  SetOwnerInput,
  SetMonthInput,
  SetFtesInput,
  SetQuoteCurrencyInput,
} from "../types";

export type SetOwnerAction = Action<"SET_OWNER", SetOwnerInput, "global">;
export type SetMonthAction = Action<"SET_MONTH", SetMonthInput, "global">;
export type SetFtesAction = Action<"SET_FTES", SetFtesInput, "global">;
export type SetQuoteCurrencyAction = Action<
  "SET_QUOTE_CURRENCY",
  SetQuoteCurrencyInput,
  "global"
>;

export type BudgetStatementBaseAction =
  | SetOwnerAction
  | SetMonthAction
  | SetFtesAction
  | SetQuoteCurrencyAction;
