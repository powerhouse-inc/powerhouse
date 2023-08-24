import type { Document, ExtendedState } from '../../document/types';
import type { BudgetStatementState } from './schema/types';
import type { BudgetStatementAction } from './actions';

export type * from './schema/types';
export type ExtendedBudgetStatementState = ExtendedState<BudgetStatementState>;
export type BudgetStatementDocument = Document<BudgetStatementState, BudgetStatementAction>;
export { BudgetStatementState, BudgetStatementAction };