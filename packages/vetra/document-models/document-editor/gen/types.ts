import type { PHDocument, PHBaseState } from "document-model";
import type { DocumentEditorAction } from "./actions.js";
import type { DocumentEditorState as DocumentEditorGlobalState } from "./schema/types.js";

type DocumentEditorLocalState = Record<PropertyKey, never>;

type DocumentEditorPHState = PHBaseState & {
  global: DocumentEditorGlobalState;
  local: DocumentEditorLocalState;
};
type DocumentEditorDocument = PHDocument<DocumentEditorPHState>;

export * from "./schema/types.js";

export type {
  DocumentEditorGlobalState,
  DocumentEditorLocalState,
  DocumentEditorPHState,
  DocumentEditorAction,
  DocumentEditorDocument,
};
