import { createAction } from "document-model/core";
import {
  SetProcessorNameInputSchema,
  SetProcessorTypeInputSchema,
  AddDocumentTypeInputSchema,
  RemoveDocumentTypeInputSchema,
  SetProcessorStatusInputSchema,
} from "../schema/zod.js";
import type {
  SetProcessorNameInput,
  SetProcessorTypeInput,
  AddDocumentTypeInput,
  RemoveDocumentTypeInput,
  SetProcessorStatusInput,
} from "../types.js";
import type {
  SetProcessorNameAction,
  SetProcessorTypeAction,
  AddDocumentTypeAction,
  RemoveDocumentTypeAction,
  SetProcessorStatusAction,
} from "./actions.js";

export const setProcessorName = (input: SetProcessorNameInput) =>
  createAction<SetProcessorNameAction>(
    "SET_PROCESSOR_NAME",
    { ...input },
    undefined,
    SetProcessorNameInputSchema,
    "global",
  );

export const setProcessorType = (input: SetProcessorTypeInput) =>
  createAction<SetProcessorTypeAction>(
    "SET_PROCESSOR_TYPE",
    { ...input },
    undefined,
    SetProcessorTypeInputSchema,
    "global",
  );

export const addDocumentType = (input: AddDocumentTypeInput) =>
  createAction<AddDocumentTypeAction>(
    "ADD_DOCUMENT_TYPE",
    { ...input },
    undefined,
    AddDocumentTypeInputSchema,
    "global",
  );

export const removeDocumentType = (input: RemoveDocumentTypeInput) =>
  createAction<RemoveDocumentTypeAction>(
    "REMOVE_DOCUMENT_TYPE",
    { ...input },
    undefined,
    RemoveDocumentTypeInputSchema,
    "global",
  );

export const setProcessorStatus = (input: SetProcessorStatusInput) =>
  createAction<SetProcessorStatusAction>(
    "SET_PROCESSOR_STATUS",
    { ...input },
    undefined,
    SetProcessorStatusInputSchema,
    "global",
  );
