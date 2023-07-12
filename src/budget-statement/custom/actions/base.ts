import {
    SetFtesAction,
    SetMonthAction,
    SetOwnerAction,
    SetQuoteCurrencyAction,
} from '../../gen/base/types';
import { BudgetStatementDocument } from '../types';

export const setOwnerOperation = (
    state: BudgetStatementDocument,
    action: SetOwnerAction
) => {
    state.state.owner = {
        id: action.input.id ?? null,
        ref: action.input.ref ?? null,
        title: action.input.title ?? null,
    };
};

export const setMonthOperation = (
    state: BudgetStatementDocument,
    action: SetMonthAction
) => {
    state.state.month = action.input;
};

export const setQuoteCurrencyOperation = (
    state: BudgetStatementDocument,
    action: SetQuoteCurrencyAction
) => {
    state.state.quoteCurrency = action.input;
};

export const setFtesOperation = (
    state: BudgetStatementDocument,
    action: SetFtesAction
) => {
    state.state.ftes = action.input;
    state.state.ftes?.forecast.sort((f1, f2) =>
        f1.month.localeCompare(f2.month)
    );
};
