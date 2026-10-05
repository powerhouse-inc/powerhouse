/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type { SetPolicyInput } from "../types.js";

export type SetPolicyAction = Action & {
  type: "SET_POLICY";
  input: SetPolicyInput;
};

export type WorkflowPolicyAction = SetPolicyAction;
