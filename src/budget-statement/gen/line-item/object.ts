import { BaseDocument } from '../../../document/object';

import {
    AddLineItemInput,
    UpdateLineItemInput,
    DeleteLineItemInput,
    SortLineItemsInput,
    BudgetStatementState
} from '../types';
import {
    addLineItem,
    updateLineItem,
    deleteLineItem,
    sortLineItems,
} from './creators';
import { BudgetStatementAction } from '../actions';

export default class BudgetStatement_LineItem extends BaseDocument<
    BudgetStatementState, BudgetStatementAction
> {
    public addLineItem(input: AddLineItemInput) {
        return this.dispatch(addLineItem(input));
    }
    
    public updateLineItem(input: UpdateLineItemInput) {
        return this.dispatch(updateLineItem(input));
    }
    
    public deleteLineItem(input: DeleteLineItemInput) {
        return this.dispatch(deleteLineItem(input));
    }
    
    public sortLineItems(input: SortLineItemsInput) {
        return this.dispatch(sortLineItems(input));
    }
    
}