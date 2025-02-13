import type { BaseDocument, DocumentModelModule, ExtendedState } from "document-model";
import type { DocumentDriveAction } from "./actions.js";
import type {
  DocumentDriveLocalState,
  DocumentDriveState,
} from "./schema/types.js";
export type * from "./schema/types.js";
export { DocumentDriveAction, DocumentDriveLocalState, DocumentDriveState };
export type ExtendedDocumentDriveState = ExtendedState<
  DocumentDriveState,
  DocumentDriveLocalState
>;
export type DocumentDriveDocument = BaseDocument<
  DocumentDriveState,
  DocumentDriveLocalState
>;

export type DriveDocumentModelModule = DocumentModelModule<
  DocumentDriveState,
  DocumentDriveLocalState,
  DocumentDriveAction
>;
