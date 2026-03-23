import { createAction } from "@powerhousedao/shared/document-model";
import {
  AddDocumentTypeInputSchema,
  AddProcessorAppInputSchema,
  RemoveDocumentTypeInputSchema,
  RemoveProcessorAppInputSchema,
  SetProcessorNameInputSchema,
  SetProcessorStatusInputSchema,
  SetProcessorTypeInputSchema,
} from "../schema/zod.js";
import type {
  AddDocumentTypeInput,
  AddProcessorAppInput,
  RemoveDocumentTypeInput,
  RemoveProcessorAppInput,
  SetProcessorNameInput,
  SetProcessorStatusInput,
  SetProcessorTypeInput,
} from "../types.js";
import type {
  AddDocumentTypeAction,
  AddProcessorAppAction,
  RemoveDocumentTypeAction,
  RemoveProcessorAppAction,
  SetProcessorNameAction,
  SetProcessorStatusAction,
  SetProcessorTypeAction,
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

export const addProcessorApp = (input: AddProcessorAppInput) =>
  createAction<AddProcessorAppAction>(
    "ADD_PROCESSOR_APP",
    { ...input },
    undefined,
    AddProcessorAppInputSchema,
    "global",
  );

export const removeProcessorApp = (input: RemoveProcessorAppInput) =>
  createAction<RemoveProcessorAppAction>(
    "REMOVE_PROCESSOR_APP",
    { ...input },
    undefined,
    RemoveProcessorAppInputSchema,
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
