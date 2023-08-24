import { BaseDocument } from '../../../document/object';

import {
    AddVestingInput,
    UpdateVestingInput,
    DeleteVestingInput,
    BudgetStatementState
} from '../types';
import {
    addVesting,
    updateVesting,
    deleteVesting,
} from './creators';
import { BudgetStatementAction } from '../actions';

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