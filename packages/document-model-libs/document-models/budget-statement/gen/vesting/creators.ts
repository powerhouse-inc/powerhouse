import {
    AddVestingInput,
    UpdateVestingInput,
    DeleteVestingInput
} from "../types.js";
import {
    AddVestingAction,
    UpdateVestingAction,
    DeleteVestingAction,
} from "./actions.js";



export const addVesting = (input: AddVestingInput) =>
  createAction<AddVestingAction>(
    "ADD_VESTING",
    { ...input },
    undefined,
    AddVestingInputSchema,
    "global",
  );

export const updateVesting = (input: UpdateVestingInput) =>
  createAction<UpdateVestingAction>(
    "UPDATE_VESTING",
    { ...input },
    undefined,
    UpdateVestingInputSchema,
    "global",
  );

export const deleteVesting = (input: DeleteVestingInput) =>
  createAction<DeleteVestingAction>(
    "DELETE_VESTING",
    { ...input },
    undefined,
    DeleteVestingInputSchema,
    "global",
  );
