import { utils } from "document-model/document";
import {
  z,
  SetOwnerInput,
  SetMonthInput,
  SetFtesInput,
  SetQuoteCurrencyInput,
} from "../types";
import {
  SetOwnerAction,
  SetMonthAction,
  SetFtesAction,
  SetQuoteCurrencyAction,
} from "./actions";

const { createAction } = utils;

export const setOwner = (input: SetOwnerInput) =>
  createAction<SetOwnerAction>(
    "SET_OWNER",
    { ...input },
    undefined,
    z.SetOwnerInputSchema,
    "global",
  );

export const setMonth = (input: SetMonthInput) =>
  createAction<SetMonthAction>(
    "SET_MONTH",
    { ...input },
    undefined,
    z.SetMonthInputSchema,
    "global",
  );

export const setFtes = (input: SetFtesInput) =>
  createAction<SetFtesAction>(
    "SET_FTES",
    { ...input },
    undefined,
    z.SetFtesInputSchema,
    "global",
  );

export const setQuoteCurrency = (input: SetQuoteCurrencyInput) =>
  createAction<SetQuoteCurrencyAction>(
    "SET_QUOTE_CURRENCY",
    { ...input },
    undefined,
    z.SetQuoteCurrencyInputSchema,
    "global",
  );
