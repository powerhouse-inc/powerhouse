import { BaseAction } from "document-model";
import {
  SetOwnerInput,
  SetMonthInput,
  SetFtesInput,
  SetQuoteCurrencyInput,
} from "../schema/types.js";

export type SetOwnerAction = BaseAction<"SET_OWNER", SetOwnerInput, "global">;
export type SetMonthAction = BaseAction<"SET_MONTH", SetMonthInput, "global">;
export type SetFtesAction = BaseAction<"SET_FTES", SetFtesInput, "global">;
export type SetQuoteCurrencyAction = BaseAction<
  "SET_QUOTE_CURRENCY",
  SetQuoteCurrencyInput,
  "global"
>;

export type BudgetStatementBaseAction =
  | SetOwnerAction
  | SetMonthAction
  | SetFtesAction
  | SetQuoteCurrencyAction;
