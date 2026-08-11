/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddMemberInputSchema,
  RemoveMemberInputSchema,
  SetGroupDescriptionInputSchema,
  SetGroupNameInputSchema,
} from "../schema/zod.js";
import type {
  AddMemberInput,
  RemoveMemberInput,
  SetGroupDescriptionInput,
  SetGroupNameInput,
} from "../types.js";
import type {
  AddMemberAction,
  RemoveMemberAction,
  SetGroupDescriptionAction,
  SetGroupNameAction,
} from "./actions.js";

export const setGroupName = (input: SetGroupNameInput) =>
  createAction<SetGroupNameAction>(
    "SET_GROUP_NAME",
    { ...input },
    undefined,
    SetGroupNameInputSchema,
    "global",
  );

export const setGroupDescription = (input: SetGroupDescriptionInput) =>
  createAction<SetGroupDescriptionAction>(
    "SET_GROUP_DESCRIPTION",
    { ...input },
    undefined,
    SetGroupDescriptionInputSchema,
    "global",
  );

export const addMember = (input: AddMemberInput) =>
  createAction<AddMemberAction>(
    "ADD_MEMBER",
    { ...input },
    undefined,
    AddMemberInputSchema,
    "global",
  );

export const removeMember = (input: RemoveMemberInput) =>
  createAction<RemoveMemberAction>(
    "REMOVE_MEMBER",
    { ...input },
    undefined,
    RemoveMemberInputSchema,
    "global",
  );
