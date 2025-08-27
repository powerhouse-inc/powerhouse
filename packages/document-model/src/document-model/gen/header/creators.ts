import { createAction } from "document-model";
import type {
  SetAuthorNameInput,
  SetAuthorWebsiteInput,
  SetModelDescriptionInput,
  SetModelExtensionInput,
  SetModelIdInput,
  SetModelNameInput,
} from "../schema/index.js";
import { z } from "../schema/index.js";
import type {
  SetAuthorNameAction,
  SetAuthorWebsiteAction,
  SetModelDescriptionAction,
  SetModelExtensionAction,
  SetModelIdAction,
  SetModelNameAction,
} from "./actions.js";

export const setModelName = (input: SetModelNameInput) =>
  createAction<SetModelNameAction>(
    "SET_MODEL_NAME",
    { ...input },
    undefined,
    z.SetModelNameInputSchema,
    "global",
  );

export const setModelId = (input: SetModelIdInput) =>
  createAction<SetModelIdAction>(
    "SET_MODEL_ID",
    { ...input },
    undefined,
    z.SetModelIdInputSchema,
    "global",
  );

export const setModelExtension = (input: SetModelExtensionInput) =>
  createAction<SetModelExtensionAction>(
    "SET_MODEL_EXTENSION",
    { ...input },
    undefined,
    z.SetModelExtensionInputSchema,
    "global",
  );

export const setModelDescription = (input: SetModelDescriptionInput) =>
  createAction<SetModelDescriptionAction>(
    "SET_MODEL_DESCRIPTION",
    { ...input },
    undefined,
    z.SetModelDescriptionInputSchema,
    "global",
  );

export const setAuthorName = (input: SetAuthorNameInput) =>
  createAction<SetAuthorNameAction>(
    "SET_AUTHOR_NAME",
    { ...input },
    undefined,
    z.SetAuthorNameInputSchema,
    "global",
  );

export const setAuthorWebsite = (input: SetAuthorWebsiteInput) =>
  createAction<SetAuthorWebsiteAction>(
    "SET_AUTHOR_WEBSITE",
    { ...input },
    undefined,
    z.SetAuthorWebsiteInputSchema,
    "global",
  );
