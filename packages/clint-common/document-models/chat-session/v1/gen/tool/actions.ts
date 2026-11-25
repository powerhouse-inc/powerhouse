/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type { AddToolOutputInput, AddToolResultInput } from "../types.js";

export type AddToolResultAction = Action & {
  type: "ADD_TOOL_RESULT";
  input: AddToolResultInput;
};
export type AddToolOutputAction = Action & {
  type: "ADD_TOOL_OUTPUT";
  input: AddToolOutputInput;
};

export type ChatSessionToolAction = AddToolResultAction | AddToolOutputAction;
