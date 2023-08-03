import { BaseDocument } from '../../../document/object';


import {
    AddAccountInput,
    UpdateAccountInput,
    DeleteAccountInput,
    SortAccountsInput,
} from '@acaldas/document-model-graphql/budget-statement';

import {
    addAccount,
    updateAccount,
    deleteAccount,
    sortAccounts,
} from './creators';

import { BudgetStatementAction } from '../actions';
import { BudgetStatementState } from '@acaldas/document-model-graphql/budget-statement';

export default class BudgetStatement_Account extends BaseDocument<
    BudgetStatementState, BudgetStatementAction
> {
    public addAccount(input: AddAccountInput) {
        return this.dispatch(addAccount(input));
    }
    
    public updateAccount(input: UpdateAccountInput) {
        return this.dispatch(updateAccount(input));
    }
    
    public deleteAccount(input: DeleteAccountInput) {
        return this.dispatch(deleteAccount(input));
    }
    
    public sortAccounts(input: SortAccountsInput) {
        return this.dispatch(sortAccounts(input));
    }
    
}