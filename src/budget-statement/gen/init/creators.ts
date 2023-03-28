import { createAction } from '../../../document/utils';
import { BudgetStatement } from '../../custom';

import { INIT, InitAction } from './types';

/**
 * Initializes the budget statement state with the provided data.
 * @param budgetStatement - Partial budget statement data to initialize the state with.
 * @category Actions
 */
export const init = (
    budgetStatement: Partial<
        Omit<BudgetStatement, 'data'> & {
            data: Partial<BudgetStatement['data']>;
        }
    >
) => createAction<InitAction>(INIT, budgetStatement);
