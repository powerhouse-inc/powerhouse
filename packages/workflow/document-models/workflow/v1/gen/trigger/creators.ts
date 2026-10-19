/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  ClearTriggerInputSchema,
  SetTriggerConfigInputSchema,
  SetTriggerConnectionInputSchema,
  SetTriggerInputSchema,
  SetTriggerPieceVersionInputSchema,
} from "../schema/zod.js";
import type {
  ClearTriggerInput,
  SetTriggerConfigInput,
  SetTriggerConnectionInput,
  SetTriggerInput,
  SetTriggerPieceVersionInput,
} from "../types.js";
import type {
  ClearTriggerAction,
  SetTriggerAction,
  SetTriggerConfigAction,
  SetTriggerConnectionAction,
  SetTriggerPieceVersionAction,
} from "./actions.js";

export const setTrigger = (input: SetTriggerInput) =>
  createAction<SetTriggerAction>(
    "SET_TRIGGER",
    { ...input },
    undefined,
    SetTriggerInputSchema,
    "global",
  );

export const clearTrigger = (input: ClearTriggerInput) =>
  createAction<ClearTriggerAction>(
    "CLEAR_TRIGGER",
    { ...input },
    undefined,
    ClearTriggerInputSchema,
    "global",
  );

export const setTriggerConfig = (input: SetTriggerConfigInput) =>
  createAction<SetTriggerConfigAction>(
    "SET_TRIGGER_CONFIG",
    { ...input },
    undefined,
    SetTriggerConfigInputSchema,
    "global",
  );

export const setTriggerConnection = (input: SetTriggerConnectionInput) =>
  createAction<SetTriggerConnectionAction>(
    "SET_TRIGGER_CONNECTION",
    { ...input },
    undefined,
    SetTriggerConnectionInputSchema,
    "global",
  );

export const setTriggerPieceVersion = (input: SetTriggerPieceVersionInput) =>
  createAction<SetTriggerPieceVersionAction>(
    "SET_TRIGGER_PIECE_VERSION",
    { ...input },
    undefined,
    SetTriggerPieceVersionInputSchema,
    "global",
  );
