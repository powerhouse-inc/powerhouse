import type { Document, ExtendedState } from "document-model/document";
import type { DocumentDriveState } from "./schema/types";
import type { DocumentDriveLocalState } from "./schema/types";
import type { DocumentDriveAction } from "./actions";

export { z } from "./schema";
export type * from "./schema/types";
export type ExtendedDocumentDriveState = ExtendedState<
  DocumentDriveState,
  DocumentDriveLocalState
>;
export type DocumentDriveDocument = Document<
  DocumentDriveState,
  DocumentDriveAction,
  DocumentDriveLocalState
>;
export { DocumentDriveState, DocumentDriveLocalState, DocumentDriveAction };
