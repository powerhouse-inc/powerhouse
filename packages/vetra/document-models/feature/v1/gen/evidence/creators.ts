/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddEvidenceInputSchema,
  RemoveEvidenceInputSchema,
  UpdateEvidenceInputSchema,
} from "../schema/zod.js";
import type {
  AddEvidenceInput,
  RemoveEvidenceInput,
  UpdateEvidenceInput,
} from "../types.js";
import type {
  AddEvidenceAction,
  RemoveEvidenceAction,
  UpdateEvidenceAction,
} from "./actions.js";

export const addEvidence = (input: AddEvidenceInput) =>
  createAction<AddEvidenceAction>(
    "ADD_EVIDENCE",
    { ...input },
    undefined,
    AddEvidenceInputSchema,
    "global",
  );

export const updateEvidence = (input: UpdateEvidenceInput) =>
  createAction<UpdateEvidenceAction>(
    "UPDATE_EVIDENCE",
    { ...input },
    undefined,
    UpdateEvidenceInputSchema,
    "global",
  );

export const removeEvidence = (input: RemoveEvidenceInput) =>
  createAction<RemoveEvidenceAction>(
    "REMOVE_EVIDENCE",
    { ...input },
    undefined,
    RemoveEvidenceInputSchema,
    "global",
  );
