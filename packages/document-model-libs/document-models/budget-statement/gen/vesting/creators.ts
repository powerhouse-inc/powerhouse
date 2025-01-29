import { utils } from "document-model/document";
import {
  z,
  AddVestingInput,
  UpdateVestingInput,
  DeleteVestingInput,
} from "../types";
import {
  AddVestingAction,
  UpdateVestingAction,
  DeleteVestingAction,
} from "./actions";

const { createAction } = utils;

export const addVesting = (input: AddVestingInput) =>
  createAction<AddVestingAction>(
    "ADD_VESTING",
    { ...input },
    undefined,
    z.AddVestingInputSchema,
    "global",
  );

export const updateVesting = (input: UpdateVestingInput) =>
  createAction<UpdateVestingAction>(
    "UPDATE_VESTING",
    { ...input },
    undefined,
    z.UpdateVestingInputSchema,
    "global",
  );

export const deleteVesting = (input: DeleteVestingInput) =>
  createAction<DeleteVestingAction>(
    "DELETE_VESTING",
    { ...input },
    undefined,
    z.DeleteVestingInputSchema,
    "global",
  );
