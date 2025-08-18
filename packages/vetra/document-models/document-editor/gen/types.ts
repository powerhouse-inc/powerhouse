import type { PHDocument, ExtendedStateFromDocument } from "document-model";
import type { DocumentEditorState } from "./schema/types.js";
import type { DocumentEditorAction } from "./actions.js";

export { z } from "./schema/index.js";
export type * from "./schema/types.js";
type DocumentEditorLocalState = Record<PropertyKey, never>;
export type ExtendedDocumentEditorState = ExtendedStateFromDocument<DocumentEditorDocument>;
export type DocumentEditorDocument = PHDocument<
  DocumentEditorState,
  DocumentEditorLocalState
>;
export type {
  DocumentEditorState,
  DocumentEditorLocalState,
  DocumentEditorAction,
};
