import { hashKey } from '../../../document/utils';
import {
    AddVestingAction,
    DeleteVestingAction,
    UpdateVestingAction,
} from '../../gen/vesting/types';
import { BudgetStatementDocument, Vesting } from '../types';

const sortVesting = (a: Vesting, b: Vesting) => (a.date < b.date ? -1 : 1);

export const addVestingOperation = (
    state: BudgetStatementDocument,
    action: AddVestingAction
) => {
    state.data.vesting.push(
        ...action.input.vesting.map(input => ({
            key: hashKey(),
            date: '',
            amount: '',
            amountOld: input.amount ?? '',
            comment: '',
            currency: '',
            vested: false,
            ...input,
        }))
    );
    state.data.vesting.sort(sortVesting);
};

export const updateVestingOperation = (
    state: BudgetStatementDocument,
    action: UpdateVestingAction
) => {
    action.input.vesting.forEach(input => {
        const index = state.data.vesting.findIndex(v => v.key === input.key);
        if (index === -1) {
            return;
        }
        const vesting = state.data.vesting[index];
        state.data.vesting[index] = { ...vesting, ...input };
    });
    state.data.vesting.sort(sortVesting);
};

export const deleteVestingOperation = (
    state: BudgetStatementDocument,
    action: DeleteVestingAction
) => {
    state.data.vesting = state.data.vesting.filter(
        vesting => !action.input.vesting.includes(vesting.key)
    );
};
