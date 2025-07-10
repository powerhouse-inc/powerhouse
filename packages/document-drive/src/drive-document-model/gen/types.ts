import type { BaseAction, ExtendedState, PHDocument } from "document-model";
import type { DocumentDriveAction } from "./actions.js";
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
  DocumentDriveState,
};
export type ExtendedDocumentDriveState = ExtendedState<
  DocumentDriveState,
  DocumentDriveLocalState
>;
export type DocumentDriveDocument = PHDocument<
  DocumentDriveState,
  DocumentDriveLocalState,
  DocumentDriveAction
>;

export type LegacySynchronizationUnit = {
  branch: Scalars["String"]["output"];
  scope: Scalars["String"]["output"];
  syncId: Scalars["ID"]["output"];
};

export type LegacyAddFileInput = AddFileInput & {
  document?: InputMaybe<PHDocument>;
  synchronizationUnits: Array<LegacySynchronizationUnit>;
};

export type LegacyAddFileAction = BaseAction<
  "ADD_FILE",
  LegacyAddFileInput,
  "global"
>;
