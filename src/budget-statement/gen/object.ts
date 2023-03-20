import { DocumentObject } from '../../document';
import {
    Account,
    AccountInput,
    BudgetStatement,
    BudgetStatementAction,
    createBudgetStatement,
    reducer,
    State,
} from '../custom';
import { addAccount, deleteAccount, updateAccount } from '../gen';

export class BudgetStatementObject extends DocumentObject<
    State,
    BudgetStatementAction
> {
    static fileExtension = 'phbs';

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

    public saveToFile(path: string) {
        return super.saveToFile(path, BudgetStatementObject.fileExtension);
    }

    public loadFromFile(path: string) {
        return super.loadFromFile(path);
    }

    static async fromFile(path: string) {
        const budgetStatement = new this();
        await budgetStatement.loadFromFile(path);
        return budgetStatement;
    }
}
