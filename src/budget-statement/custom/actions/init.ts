import { InitAction } from '../../gen/init/types';
import { BudgetStatement } from '../types';
import { createBudgetStatement } from '../utils';

export const initOperation = (
    state: BudgetStatement,
    action: InitAction
): BudgetStatement => {
    return createBudgetStatement({ ...state, ...action.input });
};
