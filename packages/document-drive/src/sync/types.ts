import { DocumentDriveDocument } from "document-model-libs/document-drive";
import { IListenerAPI, IListenerRegistry } from "./listener";
import { ISyncUnitAPI, ISyncUnitRegistry } from "./sync-unit";

export interface ISyncManager extends IListenerAPI, ISyncUnitAPI {
  addDrive(drive: DocumentDriveDocument): Promise<void>;
  removeDrive(drive: DocumentDriveDocument): Promise<void>;

  onListener: IListenerRegistry["on"];
  onSyncUnit: ISyncUnitRegistry["on"];
}
