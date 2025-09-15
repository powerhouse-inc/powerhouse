import { createAction } from "document-model";
import { z, type SetDragAndDropEnabledInput } from "../types.js";
import { type SetDragAndDropEnabledAction } from "./actions.js";

export const setDragAndDropEnabled = (input: SetDragAndDropEnabledInput) =>
  createAction<SetDragAndDropEnabledAction>(
    "SET_DRAG_AND_DROP_ENABLED",
    { ...input },
    undefined,
    z.SetDragAndDropEnabledInputSchema,
    "global",
  );
