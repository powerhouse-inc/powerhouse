import { Action } from '../../../document';
import { Vesting, VestingInput } from '../../custom';

export const ADD_VESTING = 'ADD_VESTING';
export const UPDATE_VESTING = 'UPDATE_VESTING';
export const DELETE_VESTING = 'DELETE_VESTING';

export interface AddVestingAction extends Action {
    type: typeof ADD_VESTING;
    input: {
        vesting: Partial<Vesting>[];
    };
}

export interface UpdateVestingAction extends Action {
    type: typeof UPDATE_VESTING;
    input: {
        vesting: VestingInput[];
    };
}

export interface DeleteVestingAction extends Action {
    type: typeof DELETE_VESTING;
    input: {
        vesting: Vesting['key'][];
    };
}

export type BudgetStatementVestingAction =
    | AddVestingAction
    | UpdateVestingAction
    | DeleteVestingAction;
