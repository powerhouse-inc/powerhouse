import { BaseDocument } from '../../../document';
import { Account, BudgetStatementAction, State } from '../../custom';
import { requestTopup, transferTopup } from './creators';

export default class TopupObject extends BaseDocument<
    State,
    BudgetStatementAction
> {
    /**
     * Adds a top-up request for the specified account.
     *
     * @param account - The address of the account to add the top-up request.
     * @param value - The value of the top-up request.
     *
     * @group Topup
     */
    public requestTopup(account: Account['address'], value: number) {
        return this.dispatch(requestTopup(account, value));
    }

    /**
     * Adds a top-up transer to the specified account.
     *
     * @param account - The address of the account to add the top-up transfer.
     * @param value - The value of the top-up transfer.
     * @param transaction - The transaction ID of the transfer.
     *
     * @group Topup
     *
     */
    public transferTopup(
        account: Account['address'],
        value: number,
        transaction: string
    ) {
        return this.dispatch(transferTopup(account, value, transaction));
    }

    /**
     * Gets the top-up transaction for the specified account.
     *
     * @param account - The address of the account to get the top-up transaction for.
     * @returns The top-up transaction for the specified account, if it exists.
     *
     * @group Topup
     */
    public getTopupTransaction(account: Account['address']) {
        return this.state.data.accounts.find(
            ({ address }) => address === account
        )?.topupTransaction;
    }
}
