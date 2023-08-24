import {
    AddVestingAction,
    UpdateVestingAction,
    DeleteVestingAction,
} from './actions';
import { BudgetStatementState } from '../types';

export interface BudgetStatementVestingOperations {
    addVestingOperation: (state: BudgetStatementState, action: AddVestingAction) => void,
    updateVestingOperation: (state: BudgetStatementState, action: UpdateVestingAction) => void,
    deleteVestingOperation: (state: BudgetStatementState, action: DeleteVestingAction) => void,
}