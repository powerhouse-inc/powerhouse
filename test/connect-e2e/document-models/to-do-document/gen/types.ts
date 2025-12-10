import type { PHDocument, PHBaseState } from "document-model";
import type { ToDoDocumentAction } from "./actions.js";
import type { ToDoDocumentState as ToDoDocumentGlobalState } from "./schema/types.js";

type ToDoDocumentLocalState = Record<PropertyKey, never>;
type ToDoDocumentPHState = PHBaseState & {
  global: ToDoDocumentGlobalState;
  local: ToDoDocumentLocalState;
};
type ToDoDocumentDocument = PHDocument<ToDoDocumentPHState>;

export * from "./schema/types.js";

export type {
  ToDoDocumentGlobalState,
  ToDoDocumentLocalState,
  ToDoDocumentPHState,
  ToDoDocumentAction,
  ToDoDocumentDocument,
};
