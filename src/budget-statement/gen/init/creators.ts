import { createAction } from '../../../document/utils';
import { BudgetStatement } from '../../custom';

import { INIT, InitAction } from './types';

export const init = (
    budgetStatement: Partial<
        Omit<BudgetStatement, 'data'> & {
            data: Partial<BudgetStatement['data']>;
        }
    >
) => createAction<InitAction>(INIT, budgetStatement);
