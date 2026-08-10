/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { ReactorGroupGlobalState } from "../types.js";
import type {
  AddMemberAction,
  RemoveMemberAction,
  SetGroupDescriptionAction,
  SetGroupNameAction,
} from "./actions.js";

export interface ReactorGroupGroupOperations {
  setGroupNameOperation: (
    state: ReactorGroupGlobalState,
    action: SetGroupNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  setGroupDescriptionOperation: (
    state: ReactorGroupGlobalState,
    action: SetGroupDescriptionAction,
    dispatch?: SignalDispatch,
  ) => void;
  addMemberOperation: (
    state: ReactorGroupGlobalState,
    action: AddMemberAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeMemberOperation: (
    state: ReactorGroupGlobalState,
    action: RemoveMemberAction,
    dispatch?: SignalDispatch,
  ) => void;
}
