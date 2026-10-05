/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import { AddEdgeInputSchema, RemoveEdgeInputSchema } from "../schema/zod.js";
import type { AddEdgeInput, RemoveEdgeInput } from "../types.js";
import type { AddEdgeAction, RemoveEdgeAction } from "./actions.js";

export const addEdge = (input: AddEdgeInput) =>
  createAction<AddEdgeAction>(
    "ADD_EDGE",
    { ...input },
    undefined,
    AddEdgeInputSchema,
    "global",
  );

export const removeEdge = (input: RemoveEdgeInput) =>
  createAction<RemoveEdgeAction>(
    "REMOVE_EDGE",
    { ...input },
    undefined,
    RemoveEdgeInputSchema,
    "global",
  );
