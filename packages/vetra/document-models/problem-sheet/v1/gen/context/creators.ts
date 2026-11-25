/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  ClearContextInputSchema,
  SetContextInputSchema,
} from "../schema/zod.js";
import type { ClearContextInput, SetContextInput } from "../types.js";
import type { ClearContextAction, SetContextAction } from "./actions.js";

export const setContext = (input: SetContextInput) =>
  createAction<SetContextAction>(
    "SET_CONTEXT",
    { ...input },
    undefined,
    SetContextInputSchema,
    "global",
  );

export const clearContext = (input: ClearContextInput) =>
  createAction<ClearContextAction>(
    "CLEAR_CONTEXT",
    { ...input },
    undefined,
    ClearContextInputSchema,
    "global",
  );
