import { baseActions } from "document-model";
import { todosActions } from "./gen/creators.js";

/** Actions for the TodoList document model */

export const actions = { ...baseActions, ...todosActions };
