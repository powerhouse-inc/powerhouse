import { InitAction } from '../../gen/init/types';
import { BudgetStatementDocument } from '../types';
import { createBudgetStatement } from '../utils';

export const initOperation = (
    state: BudgetStatementDocument,
    action: InitAction
): BudgetStatementDocument => {
    return createBudgetStatement({ ...state, ...action.input });
};
