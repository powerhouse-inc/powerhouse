import { Action } from '../../../document';
import {
    SetOwnerInput,
    SetMonthInput,
    SetFtesInput,
    SetQuoteCurrencyInput,
} from '../types';

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