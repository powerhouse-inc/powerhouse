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
    /**
     * Adds one or more accounts to the budget statement.
     * @param accounts An array of AccountInput objects to add.
     */
    public addAccount(accounts: AccountInput[]) {
        return this.dispatch(addAccount(accounts));
    }

    /**
     * Updates one or more existing accounts in the budget statement.
     * @param accounts An array of AccountInput objects to update.
     */
    public updateAccount(accounts: AccountInput[]) {
        return this.dispatch(updateAccount(accounts));
    }

    /**
     * Deletes one or more accounts from the budget statement.
     * @param addresses An array of addresses of the accounts to delete.
     */
    public deleteAccount(accounts: Account['address'][]) {
        return this.dispatch(deleteAccount(accounts));
    }

    /**
     * Returns an array of all accounts in the budget statement.
     */
    public getAccounts() {
        return this.state.data.accounts;
    }

    /**
     * Returns the Account object with the specified address.
     * @param address The address of the Account to retrieve.
     */
    public getAccount(address: Account['address']) {
        return this.getAccounts().find(account => account.address === address);
    }
}
