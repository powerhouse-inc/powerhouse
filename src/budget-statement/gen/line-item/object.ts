import { DocumentObject } from '../../../document';
import {
    Account,
    BudgetStatementAction,
    LineItem,
    LineItemInput,
    State,
} from '../../custom';
import { addLineItem, deleteLineItem, updateLineItem } from './creators';

export default class LineItemObject extends DocumentObject<
    State,
    BudgetStatementAction
> {
    public addLineItem(
        account: Account['address'],
        lineItems: Partial<LineItem> & Pick<LineItem, 'category' | 'group'>[]
    ) {
        return this.dispatch(addLineItem(account, lineItems));
    }

    public updateLineItem(
        account: Account['address'],
        lineItems: LineItemInput[]
    ) {
        return this.dispatch(updateLineItem(account, lineItems));
    }

    public deleteLineItem(
        account: Account['address'],
        lineItems: { category: string; group: string }[]
    ) {
        return this.dispatch(deleteLineItem(account, lineItems));
    }

    public getLineItems(account: Account['address']) {
        return this.state.data.accounts.find(
            ({ address }) => address === account
        )?.lineItems;
    }

    public getLineItem(
        account: Account['address'],
        lineItem: { category: string; group: string }
    ) {
        return this.getLineItems(account)?.find(
            ({ category, group }) =>
                category.id === lineItem.category && group.id === lineItem.group
        );
    }
}
