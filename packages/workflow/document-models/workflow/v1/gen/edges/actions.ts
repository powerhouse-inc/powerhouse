/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type { AddEdgeInput, RemoveEdgeInput } from "../types.js";

export type AddEdgeAction = Action & { type: "ADD_EDGE"; input: AddEdgeInput };
export type RemoveEdgeAction = Action & {
  type: "REMOVE_EDGE";
  input: RemoveEdgeInput;
};

export type WorkflowEdgesAction = AddEdgeAction | RemoveEdgeAction;
