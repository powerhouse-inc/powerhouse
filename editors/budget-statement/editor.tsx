import { EditorProps } from 'document-model/document';
import {
    actions,
    AddAccountInput,
    AddLineItemInput,
    BudgetStatementAction,
    BudgetStatementLocalState,
    BudgetStatementState,
    DeleteLineItemInput,
} from '../../document-models/budget-statement';
import AccountForm from './components/account-form';
import AccountsTable from './components/accounts-table';
import LineItemForm from './components/line-item-form';

export type IProps = EditorProps<
    BudgetStatementState,
    BudgetStatementAction,
    BudgetStatementLocalState
>;

function BudgetStatementEditor({
    document: budgetStatement,
    dispatch,
}: IProps) {
    function addAccount(account: AddAccountInput) {
        dispatch(actions.addAccount(account));
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

export default BudgetStatementEditor;
