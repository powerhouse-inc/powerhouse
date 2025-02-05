import { createAction } from "document-model";
import {
  SetOwnerInput,
  SetMonthInput,
  SetFtesInput,
  SetQuoteCurrencyInput,
} from "../schema/types.js";
import {
  SetOwnerInputSchema,
  SetMonthInputSchema,
  SetFtesInputSchema,
  SetQuoteCurrencyInputSchema,
} from "../schema/zod.js";
import { SetOwnerAction, SetMonthAction, SetFtesAction, SetQuoteCurrencyAction } from "./actions.js";
export const setOwner = (input: SetOwnerInput) =>
  createAction<SetOwnerAction>(
    "SET_OWNER",
    { ...input },
    undefined,
    SetOwnerInputSchema,
    "global",
  );

export const setMonth = (input: SetMonthInput) =>
  createAction<SetMonthAction>(
    "SET_MONTH",
    { ...input },
    undefined,
    SetMonthInputSchema,
    "global",
  );

export const setFtes = (input: SetFtesInput) =>
  createAction<SetFtesAction>(
    "SET_FTES",
    { ...input },
    undefined,
    SetFtesInputSchema,
    "global",
  );

export const setQuoteCurrency = (input: SetQuoteCurrencyInput) =>
  createAction<SetQuoteCurrencyAction>(
    "SET_QUOTE_CURRENCY",
    { ...input },
    undefined,
    SetQuoteCurrencyInputSchema,
    "global",
  );
