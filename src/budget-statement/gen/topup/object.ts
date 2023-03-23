import { DocumentObject } from '../../../document';
import { Account, BudgetStatementAction, State } from '../../custom';
import { requestTopup, transferTopup } from './creators';

export default class TopupObject extends DocumentObject<
    State,
    BudgetStatementAction
> {
    public requestTopup(account: Account['address'], value: number) {
        return this.dispatch(requestTopup(account, value));
    }

    public transferTopup(
        account: Account['address'],
        value: number,
        transaction: string
    ) {
        return this.dispatch(transferTopup(account, value, transaction));
    }

    public getTopupTransaction(account: Account['address']) {
        return this.state.data.accounts.find(
            ({ address }) => address === account
        )?.topupTransaction;
    }
}
