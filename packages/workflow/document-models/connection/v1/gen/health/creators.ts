/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import { RecordCheckResultInputSchema } from "../schema/zod.js";
import type { RecordCheckResultInput } from "../types.js";
import type { RecordCheckResultAction } from "./actions.js";

export const recordCheckResult = (input: RecordCheckResultInput) =>
  createAction<RecordCheckResultAction>(
    "RECORD_CHECK_RESULT",
    { ...input },
    undefined,
    RecordCheckResultInputSchema,
    "global",
  );
