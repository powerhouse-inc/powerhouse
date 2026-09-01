/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type { SetLastRunInput } from "../types.js";

export type SetLastRunAction = Action & {
  type: "SET_LAST_RUN";
  input: SetLastRunInput;
};

export type WorkflowRuntimeAction = SetLastRunAction;
