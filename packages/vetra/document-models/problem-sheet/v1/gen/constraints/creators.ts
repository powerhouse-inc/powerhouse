/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddConstraintInputSchema,
  RemoveConstraintInputSchema,
  ReorderConstraintsInputSchema,
  UpdateConstraintInputSchema,
} from "../schema/zod.js";
import type {
  AddConstraintInput,
  RemoveConstraintInput,
  ReorderConstraintsInput,
  UpdateConstraintInput,
} from "../types.js";
import type {
  AddConstraintAction,
  RemoveConstraintAction,
  ReorderConstraintsAction,
  UpdateConstraintAction,
} from "./actions.js";

export const addConstraint = (input: AddConstraintInput) =>
  createAction<AddConstraintAction>(
    "ADD_CONSTRAINT",
    { ...input },
    undefined,
    AddConstraintInputSchema,
    "global",
  );

export const updateConstraint = (input: UpdateConstraintInput) =>
  createAction<UpdateConstraintAction>(
    "UPDATE_CONSTRAINT",
    { ...input },
    undefined,
    UpdateConstraintInputSchema,
    "global",
  );

export const removeConstraint = (input: RemoveConstraintInput) =>
  createAction<RemoveConstraintAction>(
    "REMOVE_CONSTRAINT",
    { ...input },
    undefined,
    RemoveConstraintInputSchema,
    "global",
  );

export const reorderConstraints = (input: ReorderConstraintsInput) =>
  createAction<ReorderConstraintsAction>(
    "REORDER_CONSTRAINTS",
    { ...input },
    undefined,
    ReorderConstraintsInputSchema,
    "global",
  );
