import { actions as BaseActions } from '../document';
import * as gen from './gen';
export * from './custom';
export { BudgetStatement };
const { BudgetStatement, ...BudgetActions } = gen;

export const actions = { ...BaseActions, ...BudgetActions };
