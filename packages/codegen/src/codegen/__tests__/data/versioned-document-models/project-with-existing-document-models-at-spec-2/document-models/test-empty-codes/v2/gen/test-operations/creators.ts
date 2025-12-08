import { createAction } from "document-model/core";
import { SetValueInputSchema } from "../schema/zod.js";
import type { SetValueInput } from "../types.js";
import type { SetValueAction } from "./actions.js";

export const setValue = (input: SetValueInput) =>
  createAction<SetValueAction>(
    "SET_VALUE",
    { ...input },
    undefined,
    SetValueInputSchema,
    "global",
  );
