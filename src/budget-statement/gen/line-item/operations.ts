import {
    AddLineItemAction,
    UpdateLineItemAction,
    DeleteLineItemAction,
    SortLineItemsAction,
} from './actions';
import { BudgetStatementState } from '../types';

export interface BudgetStatementLineItemOperations {
    addLineItemOperation: (state: BudgetStatementState, action: AddLineItemAction) => void,
    updateLineItemOperation: (state: BudgetStatementState, action: UpdateLineItemAction) => void,
    deleteLineItemOperation: (state: BudgetStatementState, action: DeleteLineItemAction) => void,
    sortLineItemsOperation: (state: BudgetStatementState, action: SortLineItemsAction) => void,
}