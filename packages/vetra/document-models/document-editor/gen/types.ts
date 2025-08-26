import type { PHDocument } from "document-model";
import type { DocumentEditorAction } from "./actions.js";
import type { DocumentEditorPHState } from "./ph-factories.js";
import type { DocumentEditorState } from "./schema/types.js";

export { z } from "./schema/index.js";
export type * from "./schema/types.js";
type DocumentEditorLocalState = Record<PropertyKey, never>;
export type DocumentEditorDocument = PHDocument<DocumentEditorPHState>;
export type {
  DocumentEditorState,
  DocumentEditorLocalState,
  DocumentEditorAction,
};
