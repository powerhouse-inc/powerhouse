/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  SetAccountLabelInputSchema,
  SetConnectionNameInputSchema,
  SetConnectorInputSchema,
} from "../schema/zod.js";
import type {
  SetAccountLabelInput,
  SetConnectionNameInput,
  SetConnectorInput,
} from "../types.js";
import type {
  SetAccountLabelAction,
  SetConnectionNameAction,
  SetConnectorAction,
} from "./actions.js";

export const setConnectionName = (input: SetConnectionNameInput) =>
  createAction<SetConnectionNameAction>(
    "SET_CONNECTION_NAME",
    { ...input },
    undefined,
    SetConnectionNameInputSchema,
    "global",
  );

export const setConnector = (input: SetConnectorInput) =>
  createAction<SetConnectorAction>(
    "SET_CONNECTOR",
    { ...input },
    undefined,
    SetConnectorInputSchema,
    "global",
  );

export const setAccountLabel = (input: SetAccountLabelInput) =>
  createAction<SetAccountLabelAction>(
    "SET_ACCOUNT_LABEL",
    { ...input },
    undefined,
    SetAccountLabelInputSchema,
    "global",
  );
