import type { EditorProps } from "document-model";

import AccountForm from "./components/account-form";
import AccountsTable from "./components/accounts-table";
import LineItemForm from "./components/line-item-form";
import { actions } from "@document-models/budget-statement/index.js";
import { BudgetStatementAction } from "@document-models/budget-statement/gen/actions.js";
import {
  AddAccountInput,
  AddLineItemInput,
  DeleteLineItemInput,
} from "@document-models/budget-statement/gen/schema/types.js";
import {
  BudgetStatementState,
  BudgetStatementLocalState,
} from "@document-models/budget-statement/gen/types.js";
import { addAccount } from "@document-models/budget-statement/gen/actions.js";
type Props = EditorProps<
  BudgetStatementState,
  BudgetStatementAction,
  BudgetStatementLocalState
>;

export function BudgetStatementEditor({
  document: budgetStatement,
  dispatch,
}: Props) {
  function addAccount(account: AddAccountInput) {
    dispatch(addAccount(account));
  }

  function addLineItem(lineItem: AddLineItemInput) {
    dispatch(actions.addLineItem(lineItem));
  }

  function deleteAccount(account: string) {
    dispatch(actions.deleteAccount({ account }));
  }

  function deleteLineItem(input: DeleteLineItemInput) {
    dispatch(actions.deleteLineItem(input));
  }

  const accounts = budgetStatement.state.global.accounts;
  return (
    <div>
      <AccountsTable
        data={budgetStatement.state.global}
        onDeleteAccount={deleteAccount}
        onDeleteLineItem={deleteLineItem}
      />
      <hr />
      <div>
        <h3>Add account</h3>
        <AccountForm accounts={accounts} addAccount={addAccount} />
      </div>
      <div>
        <h3>Add Line Item</h3>
        <LineItemForm accounts={accounts} addLineItem={addLineItem} />
      </div>
    </div>
  );
}
