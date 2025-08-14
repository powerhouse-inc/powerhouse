import { createAction } from "document-model";
import { z, type SetAppNameInput, type SetAppStatusInput } from "../types.js";
import { type SetAppNameAction, type SetAppStatusAction } from "./actions.js";

export const setAppName = (input: SetAppNameInput) =>
  createAction<SetAppNameAction>(
    "SET_APP_NAME",
    { ...input },
    undefined,
    z.SetAppNameInputSchema,
    "global",
  );

export const setAppStatus = (input: SetAppStatusInput) =>
  createAction<SetAppStatusAction>(
    "SET_APP_STATUS",
    { ...input },
    undefined,
    z.SetAppStatusInputSchema,
    "global",
  );
