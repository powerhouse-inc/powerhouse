/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddSystemMessageInput,
  EndSessionInput,
  SetAgentDescriptionInput,
  SetAgentImageInput,
  SetAgentInfoInput,
  StartSessionInput,
  UpdateUsageSummaryInput,
} from "../types.js";

export type StartSessionAction = Action & {
  type: "START_SESSION";
  input: StartSessionInput;
};
export type SetAgentInfoAction = Action & {
  type: "SET_AGENT_INFO";
  input: SetAgentInfoInput;
};
export type EndSessionAction = Action & {
  type: "END_SESSION";
  input: EndSessionInput;
};
export type UpdateUsageSummaryAction = Action & {
  type: "UPDATE_USAGE_SUMMARY";
  input: UpdateUsageSummaryInput;
};
export type AddSystemMessageAction = Action & {
  type: "ADD_SYSTEM_MESSAGE";
  input: AddSystemMessageInput;
};
export type SetAgentImageAction = Action & {
  type: "SET_AGENT_IMAGE";
  input: SetAgentImageInput;
};
export type SetAgentDescriptionAction = Action & {
  type: "SET_AGENT_DESCRIPTION";
  input: SetAgentDescriptionInput;
};

export type ChatSessionSystemAction =
  | StartSessionAction
  | SetAgentInfoAction
  | EndSessionAction
  | UpdateUsageSummaryAction
  | AddSystemMessageAction
  | SetAgentImageAction
  | SetAgentDescriptionAction;
