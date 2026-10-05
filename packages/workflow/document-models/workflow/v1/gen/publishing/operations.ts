/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { WorkflowGlobalState } from "../types.js";
import type {
  PublishWorkflowAction,
  RevertToPublishedAction,
} from "./actions.js";

export interface WorkflowPublishingOperations {
  publishWorkflowOperation: (
    state: WorkflowGlobalState,
    action: PublishWorkflowAction,
    dispatch?: SignalDispatch,
  ) => void;
  revertToPublishedOperation: (
    state: WorkflowGlobalState,
    action: RevertToPublishedAction,
    dispatch?: SignalDispatch,
  ) => void;
}
