import type { CommentUpdateInput } from '@acaldas/document-model-graphql/budget-statement';
import { BaseDocument } from '../../../document';
import { BudgetStatementAction, CommentInput, State } from '../../custom';
import { addComment, deleteComment, updateComment } from './creators';

export default class CommentObject extends BaseDocument<
    State,
    BudgetStatementAction
> {
    public addComment(comments: CommentInput[]) {
        return this.dispatch(addComment(comments));
    }

    public updateComment(comments: CommentUpdateInput[]) {
        return this.dispatch(updateComment(comments));
    }

    public deleteComment(comments: string[]) {
        return this.dispatch(deleteComment(comments));
    }

    get comments() {
        return this._state.state.comments;
    }

    public getComment(key: string) {
        return this._state.state.comments.find(v => v.key === key);
    }
}
