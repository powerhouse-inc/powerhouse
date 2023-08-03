import type { Document, ExtendedState } from '../../document/types';
import type { BudgetStatementState } from '@acaldas/document-model-graphql/budget-statement';
import type { BudgetStatementAction } from './actions';

import type * as types from '@acaldas/document-model-graphql/budget-statement';

export type ExtendedBudgetStatementState = ExtendedState<BudgetStatementState>;
export type BudgetStatementDocument = Document<BudgetStatementState, BudgetStatementAction>;
export { types, BudgetStatementState, BudgetStatementAction };