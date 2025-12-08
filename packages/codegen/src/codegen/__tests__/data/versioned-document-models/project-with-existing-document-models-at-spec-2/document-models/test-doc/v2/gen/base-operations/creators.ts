import { createAction } from "document-model/core";
import {
  SetTestIdInputSchema,
  SetTestIdButDifferentInputSchema,
  SetTestNameInputSchema,
} from "../schema/zod.js";
import type {
  SetTestIdInput,
  SetTestIdButDifferentInput,
  SetTestNameInput,
} from "../types.js";
import type {
  SetTestIdAction,
  SetTestIdButDifferentAction,
  SetTestNameAction,
} from "./actions.js";

export const setTestId = (input: SetTestIdInput) =>
  createAction<SetTestIdAction>(
    "SET_TEST_ID",
    { ...input },
    undefined,
    SetTestIdInputSchema,
    "global",
  );

export const setTestIdButDifferent = (input: SetTestIdButDifferentInput) =>
  createAction<SetTestIdButDifferentAction>(
    "SET_TEST_ID_BUT_DIFFERENT",
    { ...input },
    undefined,
    SetTestIdButDifferentInputSchema,
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
