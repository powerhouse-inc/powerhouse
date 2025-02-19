import { BudgetStatementAction } from "../actions";
import {
  AddAccountInput,
  BudgetStatementLocalState,
  BudgetStatementState,
  DeleteAccountInput,
  SortAccountsInput,
  UpdateAccountInput,
} from "../types.js";
import {
  addAccount,
  deleteAccount,
  sortAccounts,
  updateAccount,
} from "./creators";

export default class BudgetStatement_Account extends BaseDocument<
  BudgetStatementState,
  BudgetStatementAction,
  BudgetStatementLocalState
> {
  public addAccount(input: AddAccountInput) {
    return this.dispatch(addAccount(input));
  }

  public updateAccount(input: UpdateAccountInput) {
    return this.dispatch(updateAccount(input));
  }

  public deleteAccount(input: DeleteAccountInput) {
    return this.dispatch(deleteAccount(input));
  }

  public sortAccounts(input: SortAccountsInput) {
    return this.dispatch(sortAccounts(input));
  }
}
