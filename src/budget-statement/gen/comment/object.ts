import { BaseDocument } from '../../../document';
import {
    BudgetStatementAction,
    Comment,
    CommentInput,
    State,
} from '../../custom';
import { addComment, deleteComment, updateComment } from './creators';

export default class CommentObject extends BaseDocument<
    State,
    BudgetStatementAction
> {
    public addComment(comments: Partial<Comment>[]) {
        return this.dispatch(addComment(comments));
    }

    public updateComment(comments: CommentInput[]) {
        return this.dispatch(updateComment(comments));
    }

    public deleteComment(comments: string[]) {
        return this.dispatch(deleteComment(comments));
    }
}
