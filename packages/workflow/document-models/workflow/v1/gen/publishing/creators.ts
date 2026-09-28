/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  PublishWorkflowInputSchema,
  RevertToPublishedInputSchema,
} from "../schema/zod.js";
import type { PublishWorkflowInput, RevertToPublishedInput } from "../types.js";
import type {
  PublishWorkflowAction,
  RevertToPublishedAction,
} from "./actions.js";

export const publishWorkflow = (input: PublishWorkflowInput) =>
  createAction<PublishWorkflowAction>(
    "PUBLISH_WORKFLOW",
    { ...input },
    undefined,
    PublishWorkflowInputSchema,
    "global",
  );

export const revertToPublished = (input: RevertToPublishedInput) =>
  createAction<RevertToPublishedAction>(
    "REVERT_TO_PUBLISHED",
    { ...input },
    undefined,
    RevertToPublishedInputSchema,
    "global",
  );
