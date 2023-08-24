import { createAction } from '../../../document/utils';

import {
    AddVestingInput,
    UpdateVestingInput,
    DeleteVestingInput,
} from '../types';
import {
    AddVestingAction,
    UpdateVestingAction,
    DeleteVestingAction,
} from './actions';

export const addVesting = (input: AddVestingInput) =>
    createAction<AddVestingAction>(
        'ADD_VESTING',
        {...input}
    );

export const updateVesting = (input: UpdateVestingInput) =>
    createAction<UpdateVestingAction>(
        'UPDATE_VESTING',
        {...input}
    );

export const deleteVesting = (input: DeleteVestingInput) =>
    createAction<DeleteVestingAction>(
        'DELETE_VESTING',
        {...input}
    );


