import { Action } from '../../../document';
import {
    AddCommentInput,
    UpdateCommentInput,
    DeleteCommentInput,
} from '../types';

export type AddCommentAction = Action<'ADD_COMMENT', AddCommentInput>;
export type UpdateCommentAction = Action<'UPDATE_COMMENT', UpdateCommentInput>;
export type DeleteCommentAction = Action<'DELETE_COMMENT', DeleteCommentInput>;

export type BudgetStatementCommentAction = 
    | AddCommentAction
    | UpdateCommentAction
    | DeleteCommentAction
;