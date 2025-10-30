import { createAction } from "document-model/core";
import { SetDragAndDropEnabledInputSchema } from "../schema/zod.js";
import type { SetDragAndDropEnabledInput } from "../types.js";
import type { SetDragAndDropEnabledAction } from "./actions.js";

export const setDragAndDropEnabled = (input: SetDragAndDropEnabledInput) =>
  createAction<SetDragAndDropEnabledAction>(
    "SET_DRAG_AND_DROP_ENABLED",
    { ...input },
    undefined,
    SetDragAndDropEnabledInputSchema,
    "global",
  );
