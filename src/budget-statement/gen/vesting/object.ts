import { BaseDocument } from '../../../document/object';


import {
    AddVestingInput,
    UpdateVestingInput,
    DeleteVestingInput,
} from '@acaldas/document-model-graphql/budget-statement';

import {
    addVesting,
    updateVesting,
    deleteVesting,
} from './creators';

import { BudgetStatementAction } from '../actions';
import { BudgetStatementState } from '@acaldas/document-model-graphql/budget-statement';

export default class BudgetStatement_Vesting extends BaseDocument<
    BudgetStatementState, BudgetStatementAction
> {
    public addVesting(input: AddVestingInput) {
        return this.dispatch(addVesting(input));
    }
    
    public updateVesting(input: UpdateVestingInput) {
        return this.dispatch(updateVesting(input));
    }
    
    public deleteVesting(input: DeleteVestingInput) {
        return this.dispatch(deleteVesting(input));
    }
    
}