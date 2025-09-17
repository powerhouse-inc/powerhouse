import type {
  DocumentDriveGlobalState,
  DocumentDriveLocalState,
} from "document-drive";
import type { DocumentModelModule, PHBaseState } from "document-model";

export * from "./gen/types.js";
export * from "./src/types.js";
export type DocumentDrivePHState = PHBaseState & {
  global: DocumentDriveGlobalState;
  local: DocumentDriveLocalState;
};

export type DriveDocumentModelModule =
  DocumentModelModule<DocumentDrivePHState>;
