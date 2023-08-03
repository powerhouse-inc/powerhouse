import { Action } from '../../../document';

import {
    AddVestingInput,
    UpdateVestingInput,
    DeleteVestingInput,
} from '@acaldas/document-model-graphql/budget-statement';

export type AddVestingAction = Action<'ADD_VESTING', AddVestingInput>;
export type UpdateVestingAction = Action<'UPDATE_VESTING', UpdateVestingInput>;
export type DeleteVestingAction = Action<'DELETE_VESTING', DeleteVestingInput>;

export type BudgetStatementVestingAction = 
    | AddVestingAction
    | UpdateVestingAction
    | DeleteVestingAction
;