import { BudgetStatementAction } from "../actions.js";
import { SetOwnerInput, SetMonthInput, SetFtesInput, SetQuoteCurrencyInput } from "../schema/types.js";
import { BudgetStatementState, BudgetStatementLocalState } from "../types.js";
import { setOwner, setMonth, setFtes, setQuoteCurrency } from "./creators.js";

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
