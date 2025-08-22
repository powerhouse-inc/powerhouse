import { BaseDocumentClass } from "document-model";
import {
  type SetDriveNameInput,
  type SetDriveIconInput,
  type SetSharingTypeInput,
  type SetAvailableOfflineInput,
  type AddListenerInput,
  type RemoveListenerInput,
  type AddTriggerInput,
  type RemoveTriggerInput,
  type DocumentDriveState,
  type DocumentDriveLocalState,
} from "../types.js";
import {
  setDriveName,
  setDriveIcon,
  setSharingType,
  setAvailableOffline,
  addListener,
  removeListener,
  addTrigger,
  removeTrigger,
} from "./creators.js";
import { type DocumentDriveAction } from "../actions.js";
import { DocumentDrivePHState } from "../ph-factories.js";

export default class DocumentDrive_Drive extends BaseDocumentClass<DocumentDrivePHState> {
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
