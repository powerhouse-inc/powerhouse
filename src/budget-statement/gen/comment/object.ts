import { BaseDocument } from '../../../document/object';


import {
    AddCommentInput,
    UpdateCommentInput,
    DeleteCommentInput,
} from '@acaldas/document-model-graphql/budget-statement';

import {
    addComment,
    updateComment,
    deleteComment,
} from './creators';

import { BudgetStatementAction } from '../actions';
import { BudgetStatementState } from '@acaldas/document-model-graphql/budget-statement';

export default class BudgetStatement_Comment extends BaseDocument<
    BudgetStatementState, BudgetStatementAction
> {
    public addComment(input: AddCommentInput) {
        return this.dispatch(addComment(input));
    }
    
    public updateComment(input: UpdateCommentInput) {
        return this.dispatch(updateComment(input));
    }
    
    public deleteComment(input: DeleteCommentInput) {
        return this.dispatch(deleteComment(input));
    }
    
}