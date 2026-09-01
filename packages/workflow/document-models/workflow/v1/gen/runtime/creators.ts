/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import { SetLastRunInputSchema } from "../schema/zod.js";
import type { SetLastRunInput } from "../types.js";
import type { SetLastRunAction } from "./actions.js";

export const setLastRun = (input: SetLastRunInput) =>
  createAction<SetLastRunAction>(
    "SET_LAST_RUN",
    { ...input },
    undefined,
    SetLastRunInputSchema,
    "global",
  );
