import { createAction } from '../../../document/utils';
import { BudgetStatementDocument } from '../../custom';

import { INIT, InitAction } from './types';

/**
 * Initializes the budget statement state with the provided data.
 * @param budgetStatement - Partial budget statement data to initialize the state with.
 * @group Init
 */
export const init = (
    budgetStatement: Partial<
        Omit<BudgetStatementDocument, 'data'> & {
            data: Partial<BudgetStatementDocument['data']>;
        }
    >
) => createAction<InitAction>(INIT, budgetStatement);
