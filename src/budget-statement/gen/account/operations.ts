import {
    AddAccountAction,
    UpdateAccountAction,
    DeleteAccountAction,
    SortAccountsAction,
} from './actions';
import { BudgetStatementState } from '../types';

export interface BudgetStatementAccountOperations {
    addAccountOperation: (state: BudgetStatementState, action: AddAccountAction) => void,
    updateAccountOperation: (state: BudgetStatementState, action: UpdateAccountAction) => void,
    deleteAccountOperation: (state: BudgetStatementState, action: DeleteAccountAction) => void,
    sortAccountsOperation: (state: BudgetStatementState, action: SortAccountsAction) => void,
}