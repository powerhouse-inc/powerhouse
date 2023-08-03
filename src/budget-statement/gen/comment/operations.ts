import {
    AddCommentAction,
    UpdateCommentAction,
    DeleteCommentAction,
} from './actions';

import { BudgetStatementState } from '../types';

export interface BudgetStatementCommentOperations {
    addCommentOperation: (state: BudgetStatementState, action: AddCommentAction) => void,
    updateCommentOperation: (state: BudgetStatementState, action: UpdateCommentAction) => void,
    deleteCommentOperation: (state: BudgetStatementState, action: DeleteCommentAction) => void,
}