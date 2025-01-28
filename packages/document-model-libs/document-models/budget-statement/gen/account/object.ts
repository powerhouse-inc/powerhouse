import { BaseDocument } from "document-model/document";
import {
  AddAccountInput,
  UpdateAccountInput,
  DeleteAccountInput,
  SortAccountsInput,
  BudgetStatementState,
  BudgetStatementLocalState,
} from "../types";
import {
  addAccount,
  updateAccount,
  deleteAccount,
  sortAccounts,
} from "./creators";
import { BudgetStatementAction } from "../actions";

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
