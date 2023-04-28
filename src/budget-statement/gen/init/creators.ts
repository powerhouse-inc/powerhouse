import { BudgetStatementInput } from 'document-model-graphql/budget-statement';
import { createAction } from '../../../document/utils';

import { INIT, InitAction } from './types';

/**
 * Initializes the budget statement state with the provided data.
 * @param budgetStatement - Partial budget statement data to initialize the state with.
 * @group Init
 */
export const init = (budgetStatement: BudgetStatementInput) =>
    createAction<InitAction>(INIT, budgetStatement);
