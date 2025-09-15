import type {
  DocumentDriveGlobalState,
  DocumentDriveLocalState,
} from "document-drive";
import type { DocumentModelModule, PHBaseState } from "document-model";

export type * from "./gen/types.js";
export type * from "./src/types.js";
export type DocumentDrivePHState = PHBaseState & {
  global: DocumentDriveGlobalState;
  local: DocumentDriveLocalState;
};

export type DriveDocumentModelModule =
  DocumentModelModule<DocumentDrivePHState>;
