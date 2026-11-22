/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  ActivateWbsInput,
  ArchiveWbsInput,
  CompleteWbsInput,
  ReopenWbsInput,
} from "../types.js";

export type ActivateWbsAction = Action & {
  type: "ACTIVATE_WBS";
  input: ActivateWbsInput;
};
export type CompleteWbsAction = Action & {
  type: "COMPLETE_WBS";
  input: CompleteWbsInput;
};
export type ArchiveWbsAction = Action & {
  type: "ARCHIVE_WBS";
  input: ArchiveWbsInput;
};
export type ReopenWbsAction = Action & {
  type: "REOPEN_WBS";
  input: ReopenWbsInput;
};

export type WorkBreakdownStructureWbsStatusAction =
  | ActivateWbsAction
  | CompleteWbsAction
  | ArchiveWbsAction
  | ReopenWbsAction;
