import { utils } from "document-model/document";
import {
  z,
  AddAccountInput,
  UpdateAccountInput,
  DeleteAccountInput,
  SortAccountsInput,
} from "../types";
import {
  AddAccountAction,
  UpdateAccountAction,
  DeleteAccountAction,
  SortAccountsAction,
} from "./actions";

const { createAction } = utils;

export const addAccount = (input: AddAccountInput) =>
  createAction<AddAccountAction>(
    "ADD_ACCOUNT",
    { ...input },
    undefined,
    z.AddAccountInputSchema,
    "global",
  );

export const updateAccount = (input: UpdateAccountInput) =>
  createAction<UpdateAccountAction>(
    "UPDATE_ACCOUNT",
    { ...input },
    undefined,
    z.UpdateAccountInputSchema,
    "global",
  );

export const deleteAccount = (input: DeleteAccountInput) =>
  createAction<DeleteAccountAction>(
    "DELETE_ACCOUNT",
    { ...input },
    undefined,
    z.DeleteAccountInputSchema,
    "global",
  );

export const sortAccounts = (input: SortAccountsInput) =>
  createAction<SortAccountsAction>(
    "SORT_ACCOUNTS",
    { ...input },
    undefined,
    z.SortAccountsInputSchema,
    "global",
  );
