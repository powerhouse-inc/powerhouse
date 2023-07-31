import { BaseDocument } from '../../../document';
import {
    BudgetStatementAction,
    State,
    VestingInput,
    VestingUpdateInput,
} from '../../custom';
import { addVesting, deleteVesting, updateVesting } from './creators';

export default class VestingObject extends BaseDocument<
    State,
    BudgetStatementAction
> {
    public addVesting(vesting: VestingInput[]) {
        return this.dispatch(addVesting(vesting));
    }

    public updateVesting(vesting: VestingUpdateInput[]) {
        return this.dispatch(updateVesting(vesting));
    }

    public deleteVesting(vesting: string[]) {
        return this.dispatch(deleteVesting(vesting));
    }

    get vesting() {
        return this.state.vesting;
    }

    public getVesting(key: string) {
        return this.state.vesting.find(v => v.key === key);
    }
}
