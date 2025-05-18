import type { DocumentDriveNodeAction } from "./node/actions.js";
import type { DocumentDriveDriveAction } from "./drive/actions.js";

export * from "./node/actions.js";
export * from "./drive/actions.js";

export type DocumentDriveAction =
  | DocumentDriveNodeAction
  | DocumentDriveDriveAction;
