
import { createAction } from "document-model";
import { AddAccountInput, UpdateAccountInput, DeleteAccountInput, SortAccountsInput } from "../schema/types.js";
import { AddAccountInputSchema, UpdateAccountInputSchema, DeleteAccountInputSchema, SortAccountsInputSchema } from "../schema/zod.js";
import {
  AddAccountAction,
  UpdateAccountAction,
  DeleteAccountAction,
  SortAccountsAction,
} from "./actions.js";


export const addAccount = (input: AddAccountInput) =>
  createAction<AddAccountAction>(
    "ADD_ACCOUNT",
    { ...input },
    undefined,
    AddAccountInputSchema,
    "global",
  );

export const updateAccount = (input: UpdateAccountInput) =>
  createAction<UpdateAccountAction>(
    "UPDATE_ACCOUNT",
    { ...input },
    undefined,
    UpdateAccountInputSchema,
    "global",
  );

export const deleteAccount = (input: DeleteAccountInput) =>
  createAction<DeleteAccountAction>(
    "DELETE_ACCOUNT",
    { ...input },
    undefined,
    DeleteAccountInputSchema,
    "global",
  );

export const sortAccounts = (input: SortAccountsInput) =>
  createAction<SortAccountsAction>(
    "SORT_ACCOUNTS",
    { ...input },
    undefined,
    SortAccountsInputSchema,
    "global",
  );
