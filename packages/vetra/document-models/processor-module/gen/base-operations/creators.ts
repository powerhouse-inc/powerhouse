import { createAction } from "document-model/core";
import {
  z,
  type AddDocumentTypeInput,
  type RemoveDocumentTypeInput,
  type SetProcessorNameInput,
  type SetProcessorStatusInput,
  type SetProcessorTypeInput,
} from "../types.js";
import {
  type AddDocumentTypeAction,
  type RemoveDocumentTypeAction,
  type SetProcessorNameAction,
  type SetProcessorStatusAction,
  type SetProcessorTypeAction,
} from "./actions.js";

export const setProcessorName = (input: SetProcessorNameInput) =>
  createAction<SetProcessorNameAction>(
    "SET_PROCESSOR_NAME",
    { ...input },
    undefined,
    z.SetProcessorNameInputSchema,
    "global",
  );

export const setProcessorType = (input: SetProcessorTypeInput) =>
  createAction<SetProcessorTypeAction>(
    "SET_PROCESSOR_TYPE",
    { ...input },
    undefined,
    z.SetProcessorTypeInputSchema,
    "global",
  );

export const addDocumentType = (input: AddDocumentTypeInput) =>
  createAction<AddDocumentTypeAction>(
    "ADD_DOCUMENT_TYPE",
    { ...input },
    undefined,
    z.AddDocumentTypeInputSchema,
    "global",
  );

export const removeDocumentType = (input: RemoveDocumentTypeInput) =>
  createAction<RemoveDocumentTypeAction>(
    "REMOVE_DOCUMENT_TYPE",
    { ...input },
    undefined,
    z.RemoveDocumentTypeInputSchema,
    "global",
  );

export const setProcessorStatus = (input: SetProcessorStatusInput) =>
  createAction<SetProcessorStatusAction>(
    "SET_PROCESSOR_STATUS",
    { ...input },
    undefined,
    z.SetProcessorStatusInputSchema,
    "global",
  );
