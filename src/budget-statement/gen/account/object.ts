import { AccountUpdateInput } from '@acaldas/document-model-graphql/budget-statement';
import { BaseDocument } from '../../../document';
import {
    Account,
    AccountInput,
    BudgetStatementAction,
    State,
} from '../../custom';
import {
    addAccount,
    deleteAccount,
    sortAccounts,
    updateAccount,
} from './creators';

/**
 * Account related methods and getters
 */
export default class AccountObject extends BaseDocument<
    State,
    BudgetStatementAction
> {
    /**
     * Adds one or more accounts to the budget statement.
     * @param accounts An array of AccountInput objects to add.
     *
     * @group Account
     */
    public addAccount(accounts: AccountInput[]) {
        const action = addAccount(accounts);
        return this.dispatch(action);
    }

    /**
     * Updates one or more existing accounts in the budget statement.
     * @param accounts An array of AccountInput objects to update.
     *
     * @group Account
     */
    public updateAccount(accounts: AccountUpdateInput[]) {
        return this.dispatch(updateAccount(accounts));
    }

    /**
     * Deletes one or more accounts from the budget statement.
     * @param accounts An array of addresses of the accounts to delete.
     *
     * @group Account
     */
    public deleteAccount(accounts: Account['address'][]) {
        return this.dispatch(deleteAccount(accounts));
    }

    /**
     * Sorts the accounts inthe budget statement.
     * @param accounts An array of addresses of the accounts to sort.
     *
     * @group Account
     */
    public sortAccounts(accounts: Account['address'][]) {
        return this.dispatch(sortAccounts(accounts));
    }

    /**
     * Returns an array of all accounts in the budget statement.
     *
     * @group Account
     */
    get accounts() {
        return this._state.state.accounts;
    }

    /**
     * Returns the Account object with the specified address.
     * @param address The address of the Account to retrieve.
     *
     * @group Account
     */
    public getAccount(address: Account['address']) {
        return this.accounts.find(account => account.address === address);
    }
}
