/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddToolOutputInputSchema,
  AddToolResultInputSchema,
} from "../schema/zod.js";
import type { AddToolOutputInput, AddToolResultInput } from "../types.js";
import type { AddToolOutputAction, AddToolResultAction } from "./actions.js";

export const addToolResult = (input: AddToolResultInput) =>
  createAction<AddToolResultAction>(
    "ADD_TOOL_RESULT",
    { ...input },
    undefined,
    AddToolResultInputSchema,
    "global",
  );

export const addToolOutput = (input: AddToolOutputInput) =>
  createAction<AddToolOutputAction>(
    "ADD_TOOL_OUTPUT",
    { ...input },
    undefined,
    AddToolOutputInputSchema,
    "global",
  );
