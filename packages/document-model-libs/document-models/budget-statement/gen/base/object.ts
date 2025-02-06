import { BaseDocument } from "document-model/document";
import {
  SetOwnerInput,
  SetMonthInput,
  SetFtesInput,
  SetQuoteCurrencyInput,
  BudgetStatementState,
  BudgetStatementLocalState,
} from "../types";
import { setOwner, setMonth, setFtes, setQuoteCurrency } from "./creators";
import { BudgetStatementAction } from "../actions";

export default class BudgetStatement_Base extends BaseDocument<
  BudgetStatementState,
  BudgetStatementAction,
  BudgetStatementLocalState
> {
  public setOwner(input: SetOwnerInput) {
    return this.dispatch(setOwner(input));
  }

  public setMonth(input: SetMonthInput) {
    return this.dispatch(setMonth(input));
  }

  public setFtes(input: SetFtesInput) {
    return this.dispatch(setFtes(input));
  }

  public setQuoteCurrency(input: SetQuoteCurrencyInput) {
    return this.dispatch(setQuoteCurrency(input));
  }
}
