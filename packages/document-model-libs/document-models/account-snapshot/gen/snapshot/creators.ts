import { createAction } from "document-model";
import { SetIdInput, SetOwnerIdInput, SetOwnerTypeInput, SetPeriodInput, SetStartInput, SetEndInput } from "../schema/types.js";
import { SetIdInputSchema, SetOwnerIdInputSchema, SetOwnerTypeInputSchema, SetPeriodInputSchema, SetStartInputSchema, SetEndInputSchema } from "../schema/zod.js";
import { SetIdAction, SetOwnerIdAction, SetOwnerTypeAction, SetPeriodAction, SetStartAction, SetEndAction } from "./actions.js";

export const setId = (input: SetIdInput) =>
  createAction<SetIdAction>(
    "SET_ID",
    { ...input },
    undefined,
    SetIdInputSchema,
    "global",
  );

export const setOwnerId = (input: SetOwnerIdInput) =>
  createAction<SetOwnerIdAction>(
    "SET_OWNER_ID",
    { ...input },
    undefined,
    SetOwnerIdInputSchema,
    "global",
  );

export const setOwnerType = (input: SetOwnerTypeInput) =>
  createAction<SetOwnerTypeAction>(
    "SET_OWNER_TYPE",
    { ...input },
    undefined,
    SetOwnerTypeInputSchema,
    "global",
  );

export const setPeriod = (input: SetPeriodInput) =>
  createAction<SetPeriodAction>(
    "SET_PERIOD",
    { ...input },
    undefined,
    SetPeriodInputSchema,
    "global",
  );

export const setStart = (input: SetStartInput) =>
  createAction<SetStartAction>(
    "SET_START",
    { ...input },
    undefined,
    SetStartInputSchema,
    "global",
  );

export const setEnd = (input: SetEndInput) =>
  createAction<SetEndAction>(
    "SET_END",
    { ...input },
    undefined,
    SetEndInputSchema,
    "global",
  );
