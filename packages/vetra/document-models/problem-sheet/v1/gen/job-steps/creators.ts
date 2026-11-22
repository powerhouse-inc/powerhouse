/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddJobStepInputSchema,
  RemoveJobStepInputSchema,
  ReorderJobStepsInputSchema,
  UpdateJobStepInputSchema,
} from "../schema/zod.js";
import type {
  AddJobStepInput,
  RemoveJobStepInput,
  ReorderJobStepsInput,
  UpdateJobStepInput,
} from "../types.js";
import type {
  AddJobStepAction,
  RemoveJobStepAction,
  ReorderJobStepsAction,
  UpdateJobStepAction,
} from "./actions.js";

export const addJobStep = (input: AddJobStepInput) =>
  createAction<AddJobStepAction>(
    "ADD_JOB_STEP",
    { ...input },
    undefined,
    AddJobStepInputSchema,
    "global",
  );

export const updateJobStep = (input: UpdateJobStepInput) =>
  createAction<UpdateJobStepAction>(
    "UPDATE_JOB_STEP",
    { ...input },
    undefined,
    UpdateJobStepInputSchema,
    "global",
  );

export const removeJobStep = (input: RemoveJobStepInput) =>
  createAction<RemoveJobStepAction>(
    "REMOVE_JOB_STEP",
    { ...input },
    undefined,
    RemoveJobStepInputSchema,
    "global",
  );

export const reorderJobSteps = (input: ReorderJobStepsInput) =>
  createAction<ReorderJobStepsAction>(
    "REORDER_JOB_STEPS",
    { ...input },
    undefined,
    ReorderJobStepsInputSchema,
    "global",
  );
