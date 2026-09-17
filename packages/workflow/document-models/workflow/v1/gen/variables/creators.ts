/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  RemoveVariableInputSchema,
  SetVariableInputSchema,
} from "../schema/zod.js";
import type { RemoveVariableInput, SetVariableInput } from "../types.js";
import type { RemoveVariableAction, SetVariableAction } from "./actions.js";

export const setVariable = (input: SetVariableInput) =>
  createAction<SetVariableAction>(
    "SET_VARIABLE",
    { ...input },
    undefined,
    SetVariableInputSchema,
    "global",
  );

export const removeVariable = (input: RemoveVariableInput) =>
  createAction<RemoveVariableAction>(
    "REMOVE_VARIABLE",
    { ...input },
    undefined,
    RemoveVariableInputSchema,
    "global",
  );
