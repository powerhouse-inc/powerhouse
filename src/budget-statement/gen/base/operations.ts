import {
    SetOwnerAction,
    SetMonthAction,
    SetFtesAction,
    SetQuoteCurrencyAction,
} from './actions';

import { BudgetStatementState } from '../types';

export interface BudgetStatementBaseOperations {
    setOwnerOperation: (state: BudgetStatementState, action: SetOwnerAction) => void,
    setMonthOperation: (state: BudgetStatementState, action: SetMonthAction) => void,
    setFtesOperation: (state: BudgetStatementState, action: SetFtesAction) => void,
    setQuoteCurrencyOperation: (state: BudgetStatementState, action: SetQuoteCurrencyAction) => void,
}