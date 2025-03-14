import { DocumentAction } from "document-model";
import { DocumentDriveDriveAction } from "./drive/actions.js";
import { DocumentDriveNodeAction } from "./node/actions.js";

export * from "./drive/actions.js";
export * from "./node/actions.js";

export type DocumentDriveAction =
  | DocumentDriveNodeAction
  | DocumentDriveDriveAction
  | DocumentAction;