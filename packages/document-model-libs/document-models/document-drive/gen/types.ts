import type { Document, ExtendedState } from "document-model";
import type { DocumentDriveState } from "./schema/types";
import type { DocumentDriveLocalState } from "./schema/types";
import type { DocumentDriveAction } from "./actions.js";

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
