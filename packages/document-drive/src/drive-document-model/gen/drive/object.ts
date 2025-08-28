import type {
  AddListenerInput,
  AddTriggerInput,
  DocumentDriveAction,
  DocumentDriveLocalState,
  DocumentDriveState,
  RemoveListenerInput,
  RemoveTriggerInput,
  SetAvailableOfflineInput,
  SetDriveIconInput,
  SetDriveNameInput,
  SetSharingTypeInput,
} from "document-drive";
import {
  addListener,
  addTrigger,
  removeListener,
  removeTrigger,
  setAvailableOffline,
  setDriveIcon,
  setDriveName,
  setSharingType,
} from "document-drive";
import { BaseDocumentClass } from "document-model";

export class DocumentDrive_Drive extends BaseDocumentClass<
  DocumentDriveState,
  DocumentDriveLocalState,
  DocumentDriveAction
> {
  public setDriveName(input: SetDriveNameInput) {
    return this.dispatch(setDriveName(input));
  }

  public setDriveIcon(input: SetDriveIconInput) {
    return this.dispatch(setDriveIcon(input));
  }

  public setSharingType(input: SetSharingTypeInput) {
    return this.dispatch(setSharingType(input));
  }

  public setAvailableOffline(input: SetAvailableOfflineInput) {
    return this.dispatch(setAvailableOffline(input));
  }

  public addListener(input: AddListenerInput) {
    return this.dispatch(addListener(input));
  }

  public removeListener(input: RemoveListenerInput) {
    return this.dispatch(removeListener(input));
  }

  public addTrigger(input: AddTriggerInput) {
    return this.dispatch(addTrigger(input));
  }

  public removeTrigger(input: RemoveTriggerInput) {
    return this.dispatch(removeTrigger(input));
  }
}
