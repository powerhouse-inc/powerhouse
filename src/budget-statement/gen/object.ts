import { DocumentObject } from '../../document';
import {
    Account,
    AccountInput,
    BudgetStatement,
    BudgetStatementAction,
    State,
    createBudgetStatement,
    reducer,
} from '../custom';
import { addAccount, deleteAccount, updateAccount } from '../gen';

export class BudgetStatementObject extends DocumentObject<
    State,
    BudgetStatementAction
> {
    constructor(
        initialState?: Partial<
            Omit<BudgetStatement, 'data'> & {
                data: Partial<BudgetStatement['data']>;
            }
        >
    ) {
        super(reducer, createBudgetStatement(initialState));
    }

    public addAccount(accounts: AccountInput[]) {
        return this.dispatch(addAccount(accounts));
    }

    public updateAccount(accounts: AccountInput[]) {
        return this.dispatch(updateAccount(accounts));
    }

    public deleteAccount(accounts: Account['address'][]) {
        return this.dispatch(deleteAccount(accounts));
    }
}
