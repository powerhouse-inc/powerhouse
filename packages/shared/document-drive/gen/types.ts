import type { PHDocument } from "document-model";
import type {
  DocumentDriveDriveAction,
  DocumentDriveNodeAction,
  DocumentDrivePHState,
} from "types";

export * from "./drive/types.js";
export * from "./node/types.js";
export * from "./schema/types.js";

export type DocumentDriveAction =
  | DocumentDriveNodeAction
  | DocumentDriveDriveAction;

export type DocumentDriveDocument = PHDocument<DocumentDrivePHState>;
