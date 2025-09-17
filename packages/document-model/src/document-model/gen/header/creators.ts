import type {
  SetAuthorNameAction,
  SetAuthorNameInput,
  SetAuthorWebsiteAction,
  SetAuthorWebsiteInput,
  SetModelDescriptionAction,
  SetModelDescriptionInput,
  SetModelExtensionAction,
  SetModelExtensionInput,
  SetModelIdAction,
  SetModelIdInput,
  SetModelNameAction,
  SetModelNameInput,
} from "document-model";
import {
  createAction,
  SetAuthorNameInputSchema,
  SetAuthorWebsiteInputSchema,
  SetModelDescriptionInputSchema,
  SetModelExtensionInputSchema,
  SetModelIdInputSchema,
  SetModelNameInputSchema,
} from "document-model";
export const setModelName = (input: SetModelNameInput) =>
  createAction<SetModelNameAction>(
    "SET_MODEL_NAME",
    { ...input },
    undefined,
    SetModelNameInputSchema,
    "global",
  );

export const setModelId = (input: SetModelIdInput) =>
  createAction<SetModelIdAction>(
    "SET_MODEL_ID",
    { ...input },
    undefined,
    SetModelIdInputSchema,
    "global",
  );

export const setModelExtension = (input: SetModelExtensionInput) =>
  createAction<SetModelExtensionAction>(
    "SET_MODEL_EXTENSION",
    { ...input },
    undefined,
    SetModelExtensionInputSchema,
    "global",
  );

export const setModelDescription = (input: SetModelDescriptionInput) =>
  createAction<SetModelDescriptionAction>(
    "SET_MODEL_DESCRIPTION",
    { ...input },
    undefined,
    SetModelDescriptionInputSchema,
    "global",
  );

export const setAuthorName = (input: SetAuthorNameInput) =>
  createAction<SetAuthorNameAction>(
    "SET_AUTHOR_NAME",
    { ...input },
    undefined,
    SetAuthorNameInputSchema,
    "global",
  );

export const setAuthorWebsite = (input: SetAuthorWebsiteInput) =>
  createAction<SetAuthorWebsiteAction>(
    "SET_AUTHOR_WEBSITE",
    { ...input },
    undefined,
    SetAuthorWebsiteInputSchema,
    "global",
  );
