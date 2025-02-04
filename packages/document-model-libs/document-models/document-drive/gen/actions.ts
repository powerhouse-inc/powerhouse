import { DocumentDriveNodeAction } from "./node/actions";
import { DocumentDriveDriveAction } from "./drive/actions";

export * from "./node/actions";
export * from "./drive/actions";

export type DocumentDriveAction =
  | DocumentDriveNodeAction
  | DocumentDriveDriveAction;
