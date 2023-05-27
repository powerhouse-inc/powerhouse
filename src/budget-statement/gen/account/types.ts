import type {
    AddAccountAction,
    DeleteAccountAction,
    SortAccountsAction,
    UpdateAccountAction,
} from '@acaldas/document-model-graphql/budget-statement';

export const ADD_ACCOUNT = 'ADD_ACCOUNT';
export const UPDATE_ACCOUNT = 'UPDATE_ACCOUNT';
export const DELETE_ACCOUNT = 'DELETE_ACCOUNT';
export const SORT_ACCOUNTS = 'SORT_ACCOUNTS';

export {
    AddAccountAction,
    DeleteAccountAction,
    UpdateAccountAction,
    SortAccountsAction,
};

export type BudgetStatementAccountAction =
    | AddAccountAction
    | UpdateAccountAction
    | DeleteAccountAction
    | SortAccountsAction;
