/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddColorInputSchema,
  RemoveColorInputSchema,
  ReorderColorsInputSchema,
  UpdateColorInputSchema,
} from "../schema/zod.js";
import type {
  AddColorInput,
  RemoveColorInput,
  ReorderColorsInput,
  UpdateColorInput,
} from "../types.js";
import type {
  AddColorAction,
  RemoveColorAction,
  ReorderColorsAction,
  UpdateColorAction,
} from "./actions.js";

export const addColor = (input: AddColorInput) =>
  createAction<AddColorAction>(
    "ADD_COLOR",
    { ...input },
    undefined,
    AddColorInputSchema,
    "global",
  );

export const updateColor = (input: UpdateColorInput) =>
  createAction<UpdateColorAction>(
    "UPDATE_COLOR",
    { ...input },
    undefined,
    UpdateColorInputSchema,
    "global",
  );

export const removeColor = (input: RemoveColorInput) =>
  createAction<RemoveColorAction>(
    "REMOVE_COLOR",
    { ...input },
    undefined,
    RemoveColorInputSchema,
    "global",
  );

export const reorderColors = (input: ReorderColorsInput) =>
  createAction<ReorderColorsAction>(
    "REORDER_COLORS",
    { ...input },
    undefined,
    ReorderColorsInputSchema,
    "global",
  );
