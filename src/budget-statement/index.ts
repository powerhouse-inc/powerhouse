/**
* This is a scaffold file meant for customization.
* Delete the file and run the code generator again to have it reset
*/

import { actions as BaseActions } from '../document';
import { reducer } from './gen/reducer';
import * as gen from './gen';
import { 
    createEmptyBudgetStatementState, 
    createEmptyExtendedBudgetStatementState 
} from './custom/utils';

const { BudgetStatement, ...BudgetStatementActions } = gen;
const actions = { ...BaseActions, ...BudgetStatementActions };

export {
    actions,
    reducer, 
    BudgetStatement,
    createEmptyBudgetStatementState,
    createEmptyExtendedBudgetStatementState
}