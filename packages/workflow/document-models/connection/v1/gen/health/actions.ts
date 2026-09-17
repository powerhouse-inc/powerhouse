/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type { RecordCheckResultInput } from "../types.js";

export type RecordCheckResultAction = Action & {
  type: "RECORD_CHECK_RESULT";
  input: RecordCheckResultInput;
};

export type ConnectionHealthAction = RecordCheckResultAction;
