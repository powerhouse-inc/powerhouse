import type {
    AddVestingAction,
    DeleteVestingAction,
    UpdateVestingAction,
} from '@acaldas/document-model-graphql/budget-statement';

export const ADD_VESTING = 'ADD_VESTING';
export const UPDATE_VESTING = 'UPDATE_VESTING';
export const DELETE_VESTING = 'DELETE_VESTING';

export { AddVestingAction, UpdateVestingAction, DeleteVestingAction };

export type BudgetStatementVestingAction =
    | AddVestingAction
    | UpdateVestingAction
    | DeleteVestingAction;
