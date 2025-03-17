import type {
  DocumentModelModule,
  ExtendedState,
  PHDocument,
} from "document-model";
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
export type DocumentDriveDocument = PHDocument<
  DocumentDriveState,
  DocumentDriveLocalState,
  DocumentDriveAction
>;

export type DriveDocumentModelModule =
  DocumentModelModule<DocumentDriveDocument>;
