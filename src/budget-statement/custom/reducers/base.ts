/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { BudgetStatementBaseOperations } from '../../gen/base/operations';

export const reducer: BudgetStatementBaseOperations = {
    setOwnerOperation(state, action) {
        state.owner = {
            id: action.input.id ?? null,
            ref: action.input.ref ?? null,
            title: action.input.title ?? null,
        };
    },
    setMonthOperation(state, action) {
        state.month = action.input.month;
    },
    setFtesOperation(state, action) {
        state.ftes = action.input;
        state.ftes?.forecast.sort((f1, f2) => f1.month.localeCompare(f2.month));
    },
    setQuoteCurrencyOperation(state, action) {
        state.quoteCurrency = action.input.quoteCurrency;
    },
};
