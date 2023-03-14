import { InitAction } from '../../gen';
import { BudgetStatement } from '../types';
import { createBudgetStatement } from '../utils';

export const initOperation = (
    state: BudgetStatement,
    action: InitAction
): BudgetStatement => {
    return createBudgetStatement(action.input);
};
