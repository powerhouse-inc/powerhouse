import {
    LineItemDeleteInput,
    LineItemsSortInput,
    LineItemUpdateInput,
} from '@acaldas/document-model-graphql/budget-statement';
import { BaseDocument } from '../../../document';
import { Account, BudgetStatementAction, LineItem, State } from '../../custom';
import {
    addLineItem,
    deleteLineItem,
    sortLineItems,
    updateLineItem,
} from './creators';

export default class LineItemObject extends BaseDocument<
    State,
    BudgetStatementAction
> {
    /**
     * Adds a line item to the specified account.
     * @param account The address of the account to which the line item will be added.
     * @param lineItems An array of line item objects to be added to the account.
     *
     * @group Line Item
     */
    public addLineItem(
        account: Account['address'],
        lineItems: (Partial<LineItem> & Pick<LineItem, 'category' | 'group'>)[]
    ) {
        return this.dispatch(addLineItem(account, lineItems));
    }

    /**
     * Updates line items for the specified account.
     * @param account The address of the account for which line items will be updated.
     * @param lineItems An array of line item input objects to be updated.
     *
     * @group Line Item
     */
    public updateLineItem(
        account: Account['address'],
        lineItems: LineItemUpdateInput[]
    ) {
        return this.dispatch(updateLineItem(account, lineItems));
    }

    /**
     * Deletes line items for the specified account.
     * @param account The address of the account for which line items will be deleted.
     * @param lineItems An array of objects that contain the category and group of the line items to be deleted.
     *
     * @group Line Item
     */
    public deleteLineItem(
        account: Account['address'],
        lineItems: LineItemDeleteInput[]
    ) {
        return this.dispatch(deleteLineItem(account, lineItems));
    }

    /**
     * Sorts the line items of an account.
     *
     * @param account - The account containing the line items to sort.
     * @param lineItems - An array of line items to sort.
     * @group Line Item
     */
    public sortLineItems(
        account: Account['address'],
        lineItems: LineItemsSortInput[]
    ) {
        return this.dispatch(sortLineItems(account, lineItems));
    }

    /**
     * Retrieves line items for the specified account.
     * @param account The address of the account for which line items will be retrieved.
     * @returns An array of line item objects for the specified account, or undefined if the account does not exist.
     *
     * @group Line Item
     */
    public getLineItems(account: Account['address']) {
        return this._state.state.accounts.find(
            ({ address }) => address === account
        )?.lineItems;
    }

    /**
     * Retrieves a specific line item for the specified account.
     * @param account The address of the account for which the line item will be retrieved.
     * @param lineItem An object that contains the category and group of the line item to be retrieved.
     * @returns The line item object that matches the specified category and group, or undefined if it does not exist.
     *
     * @group Line Item
     */
    public getLineItem(
        account: Account['address'],
        lineItem: LineItemDeleteInput
    ) {
        return this.getLineItems(account)?.find(
            ({ category, group }) =>
                category?.id === lineItem.category &&
                group?.id === lineItem.group
        );
    }
}
