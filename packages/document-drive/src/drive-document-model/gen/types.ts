import type { PHDocument, ExtendedState } from "document-model";
import type { DocumentDriveState } from "./schema/types.js";
import type { DocumentDriveLocalState } from "./schema/types.js";
import type { DocumentDriveAction } from "./actions.js";

export { z } from "./schema/index.js";
export type * from "./schema/types.js";
export type ExtendedDocumentDriveState = ExtendedState<
  DocumentDriveState,
  DocumentDriveLocalState
>;
export type DocumentDriveDocument = PHDocument<
  DocumentDriveState,
  DocumentDriveLocalState,
  DocumentDriveAction
>;
export type {
  DocumentDriveState,
  DocumentDriveLocalState,
  DocumentDriveAction,
};
