import { createAction } from '../../../document/utils';
import { Vesting, VestingInput } from '../../custom';
import {
    AddVestingAction,
    ADD_VESTING,
    DeleteVestingAction,
    DELETE_VESTING,
    UpdateVestingAction,
    UPDATE_VESTING,
} from './types';

export const addVesting = (vesting: Partial<Vesting>[]) =>
    createAction<AddVestingAction>(ADD_VESTING, { vesting });

export const updateVesting = (vesting: VestingInput[]) =>
    createAction<UpdateVestingAction>(UPDATE_VESTING, { vesting });

export const deleteVesting = (vesting: Vesting['key'][]) =>
    createAction<DeleteVestingAction>(DELETE_VESTING, { vesting });
