/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  ClearTriggerInputSchema,
  SetTriggerInputSchema,
} from "../schema/zod.js";
import type { ClearTriggerInput, SetTriggerInput } from "../types.js";
import type { ClearTriggerAction, SetTriggerAction } from "./actions.js";

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
