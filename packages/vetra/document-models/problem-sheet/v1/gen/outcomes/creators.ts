/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddOutcomeInputSchema,
  ClearOutcomeMetricInputSchema,
  ClearOutcomeRoleInputSchema,
  ClearOutcomeStepInputSchema,
  RemoveOutcomeInputSchema,
  ReorderOutcomesInputSchema,
  UpdateOutcomeInputSchema,
} from "../schema/zod.js";
import type {
  AddOutcomeInput,
  ClearOutcomeMetricInput,
  ClearOutcomeRoleInput,
  ClearOutcomeStepInput,
  RemoveOutcomeInput,
  ReorderOutcomesInput,
  UpdateOutcomeInput,
} from "../types.js";
import type {
  AddOutcomeAction,
  ClearOutcomeMetricAction,
  ClearOutcomeRoleAction,
  ClearOutcomeStepAction,
  RemoveOutcomeAction,
  ReorderOutcomesAction,
  UpdateOutcomeAction,
} from "./actions.js";

export const addOutcome = (input: AddOutcomeInput) =>
  createAction<AddOutcomeAction>(
    "ADD_OUTCOME",
    { ...input },
    undefined,
    AddOutcomeInputSchema,
    "global",
  );

export const updateOutcome = (input: UpdateOutcomeInput) =>
  createAction<UpdateOutcomeAction>(
    "UPDATE_OUTCOME",
    { ...input },
    undefined,
    UpdateOutcomeInputSchema,
    "global",
  );

export const removeOutcome = (input: RemoveOutcomeInput) =>
  createAction<RemoveOutcomeAction>(
    "REMOVE_OUTCOME",
    { ...input },
    undefined,
    RemoveOutcomeInputSchema,
    "global",
  );

export const reorderOutcomes = (input: ReorderOutcomesInput) =>
  createAction<ReorderOutcomesAction>(
    "REORDER_OUTCOMES",
    { ...input },
    undefined,
    ReorderOutcomesInputSchema,
    "global",
  );

export const clearOutcomeMetric = (input: ClearOutcomeMetricInput) =>
  createAction<ClearOutcomeMetricAction>(
    "CLEAR_OUTCOME_METRIC",
    { ...input },
    undefined,
    ClearOutcomeMetricInputSchema,
    "global",
  );

export const clearOutcomeRole = (input: ClearOutcomeRoleInput) =>
  createAction<ClearOutcomeRoleAction>(
    "CLEAR_OUTCOME_ROLE",
    { ...input },
    undefined,
    ClearOutcomeRoleInputSchema,
    "global",
  );

export const clearOutcomeStep = (input: ClearOutcomeStepInput) =>
  createAction<ClearOutcomeStepAction>(
    "CLEAR_OUTCOME_STEP",
    { ...input },
    undefined,
    ClearOutcomeStepInputSchema,
    "global",
  );
