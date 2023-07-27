import { hashKey } from '../../../document/utils';
import {
    AddVestingAction,
    DeleteVestingAction,
    UpdateVestingAction,
} from '../../gen/vesting/types';
import { BudgetStatementState, Vesting } from '../types';

const sortVesting = (a: Vesting, b: Vesting) => (a.date < b.date ? -1 : 1);

export const addVestingOperation = (
    state: BudgetStatementState,
    action: AddVestingAction
) => {
    action.input.vesting.forEach(input => {
        const key = input.key ?? hashKey();

        const index = state.vesting.findIndex(v => v.key === input.key);
        if (index > -1) {
            throw new Error(`Vesting with key ${key} already exists`);
        }

        state.vesting.push({
            ...input,
            key,
            date: input.date ?? '',
            amount: input.amount ?? '',
            amountOld: input.amountOld ?? input.amount ?? '',
            comment: input.comment ?? '',
            currency: input.currency ?? '',
            vested: input.vested ?? false,
        });
    });

    state.vesting.sort(sortVesting);
};

export const updateVestingOperation = (
    state: BudgetStatementState,
    action: UpdateVestingAction
) => {
    action.input.vesting.forEach(input => {
        const index = state.vesting.findIndex(v => v.key === input.key);
        if (index === -1) {
            return;
        }
        const vesting = state.vesting[index];
        state.vesting[index] = {
            ...vesting,
            ...input,
            amount: input.amount ?? vesting.amount,
            amountOld: input.amountOld ?? vesting.amountOld,
            comment: input.comment ?? vesting.comment,
            currency: input.currency ?? vesting.currency,
            date: input.date ?? vesting.date,
            vested: input.vested ?? vesting.vested,
        };
    });
    state.vesting.sort(sortVesting);
};

export const deleteVestingOperation = (
    state: BudgetStatementState,
    action: DeleteVestingAction
) => {
    state.vesting = state.vesting.filter(
        vesting => !action.input.vesting.includes(vesting.key)
    );
};
