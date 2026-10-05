/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  SetLastRunInputSchema,
  SetLastTestInputSchema,
} from "../schema/zod.js";
import type { SetLastRunInput, SetLastTestInput } from "../types.js";
import type { SetLastRunAction, SetLastTestAction } from "./actions.js";

export const setLastRun = (input: SetLastRunInput) =>
  createAction<SetLastRunAction>(
    "SET_LAST_RUN",
    { ...input },
    undefined,
    SetLastRunInputSchema,
    "global",
  );

export const setLastTest = (input: SetLastTestInput) =>
  createAction<SetLastTestAction>(
    "SET_LAST_TEST",
    { ...input },
    undefined,
    SetLastTestInputSchema,
    "global",
  );
