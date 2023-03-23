import { actions as BaseActions } from '../document/';
import * as gen from './gen';
export * from './custom';
export { BudgetStatementObject };
const { BudgetStatementObject, ...BudgetActions } = gen;

export const actions = { ...BaseActions, ...BudgetActions };
