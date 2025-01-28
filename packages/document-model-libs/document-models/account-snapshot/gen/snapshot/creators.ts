import { utils } from "document-model/document";
import {
  z,
  SetIdInput,
  SetOwnerIdInput,
  SetOwnerTypeInput,
  SetPeriodInput,
  SetStartInput,
  SetEndInput,
} from "../types";
import {
  SetIdAction,
  SetOwnerIdAction,
  SetOwnerTypeAction,
  SetPeriodAction,
  SetStartAction,
  SetEndAction,
} from "./actions";

const { createAction } = utils;

export const setId = (input: SetIdInput) =>
  createAction<SetIdAction>(
    "SET_ID",
    { ...input },
    undefined,
    z.SetIdInputSchema,
    "global",
  );

export const setOwnerId = (input: SetOwnerIdInput) =>
  createAction<SetOwnerIdAction>(
    "SET_OWNER_ID",
    { ...input },
    undefined,
    z.SetOwnerIdInputSchema,
    "global",
  );

export const setOwnerType = (input: SetOwnerTypeInput) =>
  createAction<SetOwnerTypeAction>(
    "SET_OWNER_TYPE",
    { ...input },
    undefined,
    z.SetOwnerTypeInputSchema,
    "global",
  );

export const setPeriod = (input: SetPeriodInput) =>
  createAction<SetPeriodAction>(
    "SET_PERIOD",
    { ...input },
    undefined,
    z.SetPeriodInputSchema,
    "global",
  );

export const setStart = (input: SetStartInput) =>
  createAction<SetStartAction>(
    "SET_START",
    { ...input },
    undefined,
    z.SetStartInputSchema,
    "global",
  );

export const setEnd = (input: SetEndInput) =>
  createAction<SetEndAction>(
    "SET_END",
    { ...input },
    undefined,
    z.SetEndInputSchema,
    "global",
  );
