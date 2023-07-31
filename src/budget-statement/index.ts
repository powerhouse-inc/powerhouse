import { actions as BaseActions } from '../document';
import { reducer, utils } from './custom';
import * as gen from './gen';
export * from './custom';
export type {
    BudgetStatementAction,
    BudgetStatementDocument,
    BudgetStatementState,
    ExtendedBudgetStatementState,
    types,
} from './custom';
export { BudgetStatement };
const { BudgetStatement, ...BudgetActions } = gen;

export const actions = { ...BaseActions, ...BudgetActions };

export default {
    actions,
    reducer,
    utils,
    BudgetStatement,
};
