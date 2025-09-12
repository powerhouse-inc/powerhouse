import type {
  AddFileInput,
  DocumentDriveDriveAction,
  DocumentDriveNodeAction,
  DocumentDrivePHState,
  InputMaybe,
  Scalars,
} from "document-drive";
import type { Action, PHDocument } from "document-model";

export type * from "./drive/types.js";
export type * from "./node/types.js";
export type * from "./schema/types.js";

export type DocumentDriveAction =
  | DocumentDriveNodeAction
  | DocumentDriveDriveAction;

export type DocumentDriveDocument = PHDocument<DocumentDrivePHState>;

export type LegacySynchronizationUnit = {
  branch: Scalars["String"]["output"];
  scope: Scalars["String"]["output"];
  syncId: Scalars["ID"]["output"];
};

export type LegacyAddFileInput = AddFileInput & {
  document?: InputMaybe<PHDocument>;
  synchronizationUnits: Array<LegacySynchronizationUnit>;
};

export type LegacyAddFileAction = Action & {
  type: "ADD_FILE";
  input: LegacyAddFileInput;
};
