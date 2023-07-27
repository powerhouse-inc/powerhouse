import {
    SetFtesAction,
    SetMonthAction,
    SetOwnerAction,
    SetQuoteCurrencyAction,
} from '../../gen/base/types';
import { BudgetStatementState } from '../types';

export const setOwnerOperation = (
    state: BudgetStatementState,
    action: SetOwnerAction
) => {
    state.owner = {
        id: action.input.id ?? null,
        ref: action.input.ref ?? null,
        title: action.input.title ?? null,
    };
};

export const setMonthOperation = (
    state: BudgetStatementState,
    action: SetMonthAction
) => {
    state.month = action.input;
};

export const setQuoteCurrencyOperation = (
    state: BudgetStatementState,
    action: SetQuoteCurrencyAction
) => {
    state.quoteCurrency = action.input;
};

export const setFtesOperation = (
    state: BudgetStatementState,
    action: SetFtesAction
) => {
    state.ftes = action.input;
    state.ftes?.forecast.sort((f1, f2) => f1.month.localeCompare(f2.month));
};
