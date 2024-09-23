/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */
import { utils } from 'document-model/document';
import { Vesting } from '../../gen/schema/types';
import { BudgetStatementVestingOperations } from '../../gen/vesting/operations';

const sortVesting = (a: Vesting, b: Vesting) => (a.date < b.date ? -1 : 1);

export const reducer: BudgetStatementVestingOperations = {
    addVestingOperation(state, action) {
        const { input } = action;
        const key = input.key ?? utils.hashKey();

        const index = state.vesting.findIndex((v) => v.key === input.key);
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

        state.vesting.sort(sortVesting);
    },
    updateVestingOperation(state, action) {
        const { input } = action;
        const index = state.vesting.findIndex((v) => v.key === input.key);
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

        state.vesting.sort(sortVesting);
    },
    deleteVestingOperation(state, action) {
        state.vesting = state.vesting.filter(
            (vesting) => !action.input.vesting.includes(vesting.key),
        );
    },
};
