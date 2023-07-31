import { z } from '@acaldas/document-model-graphql/budget-statement';
import { createAction } from '../../../document/utils';
import { Vesting, VestingInput, VestingUpdateInput } from '../../custom';
import {
    AddVestingAction,
    ADD_VESTING,
    DeleteVestingAction,
    DELETE_VESTING,
    UpdateVestingAction,
    UPDATE_VESTING,
} from './types';

export const addVesting = (vesting: VestingInput[]) =>
    createAction<AddVestingAction>(
        ADD_VESTING,
        { vesting },
        undefined,
        z.AddVestingActionSchema
    );

export const updateVesting = (vesting: VestingUpdateInput[]) =>
    createAction<UpdateVestingAction>(
        UPDATE_VESTING,
        { vesting },
        undefined,
        z.UpdateVestingActionSchema
    );

export const deleteVesting = (vesting: Vesting['key'][]) =>
    createAction<DeleteVestingAction>(
        DELETE_VESTING,
        { vesting },
        undefined,
        z.DeleteVestingActionSchema
    );
