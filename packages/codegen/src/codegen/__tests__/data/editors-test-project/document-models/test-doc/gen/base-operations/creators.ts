import { createAction } from "document-model/core";
import { SetTestIdInputSchema, SetTestNameInputSchema } from "../schema/zod.js";
import type { SetTestIdInput, SetTestNameInput } from "../types.js";
import type { SetTestIdAction, SetTestNameAction } from "./actions.js";

export const setTestId = (input: SetTestIdInput) =>
  createAction<SetTestIdAction>(
    "SET_TEST_ID",
    { ...input },
    undefined,
    SetTestIdInputSchema,
    "global",
  );

export const setTestName = (input: SetTestNameInput) =>
  createAction<SetTestNameAction>(
    "SET_TEST_NAME",
    { ...input },
    undefined,
    SetTestNameInputSchema,
    "global",
  );
