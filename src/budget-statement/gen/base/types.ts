import type {
    SetFtesAction,
    SetMonthAction,
    SetOwnerAction,
    SetQuoteCurrencyAction,
} from '@acaldas/document-model-graphql/budget-statement';

export const SET_OWNER = 'SET_OWNER';
export const SET_MONTH = 'SET_MONTH';
export const SET_QUOTE_CURRENCY = 'SET_QUOTE_CURRENCY';
export const SET_FTES = 'SET_FTES';

export {
    SetOwnerAction,
    SetMonthAction,
    SetQuoteCurrencyAction,
    SetFtesAction,
};

export type BudgetStatementBaseAction =
    | SetOwnerAction
    | SetMonthAction
    | SetQuoteCurrencyAction
    | SetFtesAction;
