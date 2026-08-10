/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddMemberInput,
  RemoveMemberInput,
  SetGroupDescriptionInput,
  SetGroupNameInput,
} from "../types.js";

export type SetGroupNameAction = Action & {
  type: "SET_GROUP_NAME";
  input: SetGroupNameInput;
};
export type SetGroupDescriptionAction = Action & {
  type: "SET_GROUP_DESCRIPTION";
  input: SetGroupDescriptionInput;
};
export type AddMemberAction = Action & {
  type: "ADD_MEMBER";
  input: AddMemberInput;
};
export type RemoveMemberAction = Action & {
  type: "REMOVE_MEMBER";
  input: RemoveMemberInput;
};

export type ReactorGroupGroupAction =
  | SetGroupNameAction
  | SetGroupDescriptionAction
  | AddMemberAction
  | RemoveMemberAction;
