import type {
    AddCommentAction,
    DeleteCommentAction,
    UpdateCommentAction,
} from '@acaldas/document-model-graphql/budget-statement';

export const ADD_COMMENT = 'ADD_COMMENT';
export const UPDATE_COMMENT = 'UPDATE_COMMENT';
export const DELETE_COMMENT = 'DELETE_COMMENT';

export { AddCommentAction, DeleteCommentAction, UpdateCommentAction };

export type BudgetStatementCommentAction =
    | AddCommentAction
    | UpdateCommentAction
    | DeleteCommentAction;
