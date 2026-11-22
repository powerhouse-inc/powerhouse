/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  ActivateWbsInputSchema,
  ArchiveWbsInputSchema,
  CompleteWbsInputSchema,
  ReopenWbsInputSchema,
} from "../schema/zod.js";
import type {
  ActivateWbsInput,
  ArchiveWbsInput,
  CompleteWbsInput,
  ReopenWbsInput,
} from "../types.js";
import type {
  ActivateWbsAction,
  ArchiveWbsAction,
  CompleteWbsAction,
  ReopenWbsAction,
} from "./actions.js";

export const activateWbs = (input: ActivateWbsInput) =>
  createAction<ActivateWbsAction>(
    "ACTIVATE_WBS",
    { ...input },
    undefined,
    ActivateWbsInputSchema,
    "global",
  );

export const completeWbs = (input: CompleteWbsInput) =>
  createAction<CompleteWbsAction>(
    "COMPLETE_WBS",
    { ...input },
    undefined,
    CompleteWbsInputSchema,
    "global",
  );

export const archiveWbs = (input: ArchiveWbsInput) =>
  createAction<ArchiveWbsAction>(
    "ARCHIVE_WBS",
    { ...input },
    undefined,
    ArchiveWbsInputSchema,
    "global",
  );

export const reopenWbs = (input: ReopenWbsInput) =>
  createAction<ReopenWbsAction>(
    "REOPEN_WBS",
    { ...input },
    undefined,
    ReopenWbsInputSchema,
    "global",
  );
