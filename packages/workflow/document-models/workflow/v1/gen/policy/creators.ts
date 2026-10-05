/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import { SetPolicyInputSchema } from "../schema/zod.js";
import type { SetPolicyInput } from "../types.js";
import type { SetPolicyAction } from "./actions.js";

export const setPolicy = (input: SetPolicyInput) =>
  createAction<SetPolicyAction>(
    "SET_POLICY",
    { ...input },
    undefined,
    SetPolicyInputSchema,
    "global",
  );
