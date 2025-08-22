import type { Action, PHDocument } from "document-model";
import type { DocumentDriveAction } from "./actions.js";
import { DocumentDrivePHState } from "./ph-factories.js";
import type {
  AddFileInput,
  DocumentDriveLocalState,
  DocumentDriveState,
  InputMaybe,
  Scalars,
} from "./schema/types.js";

export { z } from "./schema/index.js";
export type * from "./schema/types.js";
export type {
  DocumentDriveAction,
  DocumentDriveLocalState,
  DocumentDrivePHState,
  DocumentDriveState,
};
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
