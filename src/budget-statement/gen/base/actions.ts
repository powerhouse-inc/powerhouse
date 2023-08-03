import { Action } from '../../../document';

import {
    SetOwnerInput,
    SetMonthInput,
    SetFtesInput,
    SetQuoteCurrencyInput,
} from '@acaldas/document-model-graphql/budget-statement';

export type SetOwnerAction = Action<'SET_OWNER', SetOwnerInput>;
export type SetMonthAction = Action<'SET_MONTH', SetMonthInput>;
export type SetFtesAction = Action<'SET_FTES', SetFtesInput>;
export type SetQuoteCurrencyAction = Action<'SET_QUOTE_CURRENCY', SetQuoteCurrencyInput>;

export type BudgetStatementBaseAction = 
    | SetOwnerAction
    | SetMonthAction
    | SetFtesAction
    | SetQuoteCurrencyAction
;