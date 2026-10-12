/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  RemoveConfigValueInputSchema,
  RemoveSecretRefInputSchema,
  SetConfigInputSchema,
  SetConfigValueInputSchema,
  SetSecretRefInputSchema,
} from "../schema/zod.js";
import type {
  RemoveConfigValueInput,
  RemoveSecretRefInput,
  SetConfigInput,
  SetConfigValueInput,
  SetSecretRefInput,
} from "../types.js";
import type {
  RemoveConfigValueAction,
  RemoveSecretRefAction,
  SetConfigAction,
  SetConfigValueAction,
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

export const setConfigValue = (input: SetConfigValueInput) =>
  createAction<SetConfigValueAction>(
    "SET_CONFIG_VALUE",
    { ...input },
    undefined,
    SetConfigValueInputSchema,
    "global",
  );

export const removeConfigValue = (input: RemoveConfigValueInput) =>
  createAction<RemoveConfigValueAction>(
    "REMOVE_CONFIG_VALUE",
    { ...input },
    undefined,
    RemoveConfigValueInputSchema,
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
