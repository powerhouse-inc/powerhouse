/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type { PublishWorkflowInput, RevertToPublishedInput } from "../types.js";

export type PublishWorkflowAction = Action & {
  type: "PUBLISH_WORKFLOW";
  input: PublishWorkflowInput;
};
export type RevertToPublishedAction = Action & {
  type: "REVERT_TO_PUBLISHED";
  input: RevertToPublishedInput;
};

export type WorkflowPublishingAction =
  | PublishWorkflowAction
  | RevertToPublishedAction;
