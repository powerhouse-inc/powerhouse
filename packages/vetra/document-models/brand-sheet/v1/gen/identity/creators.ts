/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  ClearConceptInputSchema,
  ClearMaximInputSchema,
  ClearProductNameInputSchema,
  SetConceptInputSchema,
  SetMaximInputSchema,
  SetProductNameInputSchema,
} from "../schema/zod.js";
import type {
  ClearConceptInput,
  ClearMaximInput,
  ClearProductNameInput,
  SetConceptInput,
  SetMaximInput,
  SetProductNameInput,
} from "../types.js";
import type {
  ClearConceptAction,
  ClearMaximAction,
  ClearProductNameAction,
  SetConceptAction,
  SetMaximAction,
  SetProductNameAction,
} from "./actions.js";

export const setProductName = (input: SetProductNameInput) =>
  createAction<SetProductNameAction>(
    "SET_PRODUCT_NAME",
    { ...input },
    undefined,
    SetProductNameInputSchema,
    "global",
  );

export const clearProductName = (input: ClearProductNameInput) =>
  createAction<ClearProductNameAction>(
    "CLEAR_PRODUCT_NAME",
    { ...input },
    undefined,
    ClearProductNameInputSchema,
    "global",
  );

export const setMaxim = (input: SetMaximInput) =>
  createAction<SetMaximAction>(
    "SET_MAXIM",
    { ...input },
    undefined,
    SetMaximInputSchema,
    "global",
  );

export const clearMaxim = (input: ClearMaximInput) =>
  createAction<ClearMaximAction>(
    "CLEAR_MAXIM",
    { ...input },
    undefined,
    ClearMaximInputSchema,
    "global",
  );

export const setConcept = (input: SetConceptInput) =>
  createAction<SetConceptAction>(
    "SET_CONCEPT",
    { ...input },
    undefined,
    SetConceptInputSchema,
    "global",
  );

export const clearConcept = (input: ClearConceptInput) =>
  createAction<ClearConceptAction>(
    "CLEAR_CONCEPT",
    { ...input },
    undefined,
    ClearConceptInputSchema,
    "global",
  );
