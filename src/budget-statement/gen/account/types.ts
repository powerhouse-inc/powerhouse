import {
    AddAccountAction,
    DeleteAccountAction,
    UpdateAccountAction,
} from 'document-model-graphql/budget-statement';

export const ADD_ACCOUNT = 'ADD_ACCOUNT';
export const UPDATE_ACCOUNT = 'UPDATE_ACCOUNT';
export const DELETE_ACCOUNT = 'DELETE_ACCOUNT';

export { AddAccountAction, DeleteAccountAction, UpdateAccountAction };

export type BudgetStatementAccountAction =
    | AddAccountAction
    | UpdateAccountAction
    | DeleteAccountAction;
