/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddStepInputSchema,
  RemoveStepInputSchema,
  SetStepConfigInputSchema,
  UpdateStepInputSchema,
} from "../schema/zod.js";
import type {
  AddStepInput,
  RemoveStepInput,
  SetStepConfigInput,
  UpdateStepInput,
} from "../types.js";
import type {
  AddStepAction,
  RemoveStepAction,
  SetStepConfigAction,
  UpdateStepAction,
} from "./actions.js";

export const addStep = (input: AddStepInput) =>
  createAction<AddStepAction>(
    "ADD_STEP",
    { ...input },
    undefined,
    AddStepInputSchema,
    "global",
  );

export const updateStep = (input: UpdateStepInput) =>
  createAction<UpdateStepAction>(
    "UPDATE_STEP",
    { ...input },
    undefined,
    UpdateStepInputSchema,
    "global",
  );

export const removeStep = (input: RemoveStepInput) =>
  createAction<RemoveStepAction>(
    "REMOVE_STEP",
    { ...input },
    undefined,
    RemoveStepInputSchema,
    "global",
  );

export const setStepConfig = (input: SetStepConfigInput) =>
  createAction<SetStepConfigAction>(
    "SET_STEP_CONFIG",
    { ...input },
    undefined,
    SetStepConfigInputSchema,
    "global",
  );
