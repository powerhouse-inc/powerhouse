import { Action } from "document-model/document";
import {
  AddVestingInput,
  UpdateVestingInput,
  DeleteVestingInput,
} from "../types";

export type AddVestingAction = Action<"ADD_VESTING", AddVestingInput, "global">;
export type UpdateVestingAction = Action<
  "UPDATE_VESTING",
  UpdateVestingInput,
  "global"
>;
export type DeleteVestingAction = Action<
  "DELETE_VESTING",
  DeleteVestingInput,
  "global"
>;

export type BudgetStatementVestingAction =
  | AddVestingAction
  | UpdateVestingAction
  | DeleteVestingAction;
