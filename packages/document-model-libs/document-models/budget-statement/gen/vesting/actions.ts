import {
    AddVestingInput,
    UpdateVestingInput,
    DeleteVestingInput,
} from "../types.js";

export type AddVestingAction = BaseAction<"ADD_VESTING", AddVestingInput, "global">;
export type UpdateVestingAction = BaseAction<
  "UPDATE_VESTING",
  UpdateVestingInput,
  "global"
>;
export type DeleteVestingAction = BaseAction<
  "DELETE_VESTING",
  DeleteVestingInput,
  "global"
>;

export type BudgetStatementVestingAction =
  | AddVestingAction
  | UpdateVestingAction
  | DeleteVestingAction;
