/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
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
  DocumentEditorAction,
  DocumentEditorDocument,
  DocumentEditorGlobalState,
  DocumentEditorLocalState,
  DocumentEditorPHState,
};
