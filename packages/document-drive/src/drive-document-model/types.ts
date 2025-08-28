import type {
  DocumentDriveLocalState,
  DocumentDriveState,
} from "document-drive";
import type { PHBaseState } from "document-model";
export type * from "./gen/types.js";
export type * from "./src/types.js";
export type DocumentDrivePHState = PHBaseState & {
  global: DocumentDriveState;
  local: DocumentDriveLocalState;
};
