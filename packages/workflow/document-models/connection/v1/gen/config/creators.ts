/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  RemoveSecretRefInputSchema,
  SetConfigInputSchema,
  SetSecretRefInputSchema,
} from "../schema/zod.js";
import type {
  RemoveSecretRefInput,
  SetConfigInput,
  SetSecretRefInput,
} from "../types.js";
import type {
  RemoveSecretRefAction,
  SetConfigAction,
  SetSecretRefAction,
} from "./actions.js";

export const setConfig = (input: SetConfigInput) =>
  createAction<SetConfigAction>(
    "SET_CONFIG",
    { ...input },
    undefined,
    SetConfigInputSchema,
    "global",
  );

export const setSecretRef = (input: SetSecretRefInput) =>
  createAction<SetSecretRefAction>(
    "SET_SECRET_REF",
    { ...input },
    undefined,
    SetSecretRefInputSchema,
    "global",
  );

export const removeSecretRef = (input: RemoveSecretRefInput) =>
  createAction<RemoveSecretRefAction>(
    "REMOVE_SECRET_REF",
    { ...input },
    undefined,
    RemoveSecretRefInputSchema,
    "global",
  );
