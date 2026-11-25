/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  ClearCoreJobInputSchema,
  SetCoreJobInputSchema,
  UpdateCoreJobInputSchema,
} from "../schema/zod.js";
import type {
  ClearCoreJobInput,
  SetCoreJobInput,
  UpdateCoreJobInput,
} from "../types.js";
import type {
  ClearCoreJobAction,
  SetCoreJobAction,
  UpdateCoreJobAction,
} from "./actions.js";

export const setCoreJob = (input: SetCoreJobInput) =>
  createAction<SetCoreJobAction>(
    "SET_CORE_JOB",
    { ...input },
    undefined,
    SetCoreJobInputSchema,
    "global",
  );

export const updateCoreJob = (input: UpdateCoreJobInput) =>
  createAction<UpdateCoreJobAction>(
    "UPDATE_CORE_JOB",
    { ...input },
    undefined,
    UpdateCoreJobInputSchema,
    "global",
  );

export const clearCoreJob = (input: ClearCoreJobInput) =>
  createAction<ClearCoreJobAction>(
    "CLEAR_CORE_JOB",
    { ...input },
    undefined,
    ClearCoreJobInputSchema,
    "global",
  );
