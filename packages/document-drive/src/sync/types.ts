import { Document } from "document-model/document";
import { IListenerAPI, IListenerRegistry } from "./listener";
import { ISyncUnitRegistry, SyncUnit } from "./sync-unit";

export interface ISyncManager extends IListenerAPI {
  addDocumentSyncUnits(
    documentId: string,
    driveId: string | undefined,
    document: Document,
  ): Promise<SyncUnit[]>;

  removeDocumentSyncUnits(
    documentId: string,
    driveId: string | undefined,
  ): Promise<SyncUnit[]>;

  removeDriveSyncUnits(driveId: string): Promise<SyncUnit[]>;

  onListener: IListenerRegistry["on"];
  onSyncUnit: ISyncUnitRegistry["on"];
}
