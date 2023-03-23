import { DocumentObject } from '../../../document';
import {
    Account,
    AccountInput,
    BudgetStatementAction,
    State,
} from '../../custom';
import { addAccount, deleteAccount, updateAccount } from './creators';

export default class AccountObject extends DocumentObject<
    State,
    BudgetStatementAction
> {
    public addAccount(accounts: AccountInput[]) {
        return this.dispatch(addAccount(accounts));
    }

    public updateAccount(accounts: AccountInput[]) {
        return this.dispatch(updateAccount(accounts));
    }

    public deleteAccount(accounts: Account['address'][]) {
        return this.dispatch(deleteAccount(accounts));
    }

    public getAccounts() {
        return this.state.data.accounts;
    }

    public getAccount(address: Account['address']) {
        return this.getAccounts().find(account => account.address === address);
    }
}
