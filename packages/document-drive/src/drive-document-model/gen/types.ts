import type { Document, ExtendedState } from "document-model";
import type { DocumentDriveAction } from "./actions.js";
import type { DocumentDriveLocalState, DocumentDriveState } from "./schema/types.js";

export { z } from "./schema/index.js";
export type * from "./schema/types.js";
export { DocumentDriveAction, DocumentDriveLocalState, DocumentDriveState };
export type ExtendedDocumentDriveState = ExtendedState<
  DocumentDriveState,
  DocumentDriveLocalState
>;
export type DocumentDriveDocument = Document<
  DocumentDriveState,
  DocumentDriveAction,
  DocumentDriveLocalState
>;

