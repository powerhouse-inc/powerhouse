import { Action } from '../../../document';
import { Comment, CommentInput } from '../../custom';

export const ADD_COMMENT = 'ADD_COMMENT';
export const UPDATE_COMMENT = 'UPDATE_COMMENT';
export const DELETE_COMMENT = 'DELETE_COMMENT';

export interface AddCommentAction extends Action {
    type: typeof ADD_COMMENT;
    input: {
        comments: Partial<Comment>[];
    };
}

export interface UpdateCommentAction extends Action {
    type: typeof UPDATE_COMMENT;
    input: {
        comments: CommentInput[];
    };
}

export interface DeleteCommentAction extends Action {
    type: typeof DELETE_COMMENT;
    input: {
        comments: Comment['key'][];
    };
}

export type BudgetStatementCommentAction =
    | AddCommentAction
    | UpdateCommentAction
    | DeleteCommentAction;
