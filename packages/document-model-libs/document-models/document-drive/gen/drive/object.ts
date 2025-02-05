import { BaseDocument } from "document-model/document";
import {
  SetDriveNameInput,
  SetDriveIconInput,
  SetSharingTypeInput,
  SetAvailableOfflineInput,
  AddListenerInput,
  RemoveListenerInput,
  AddTriggerInput,
  RemoveTriggerInput,
  DocumentDriveState,
  DocumentDriveLocalState,
} from "../types";
import {
  setDriveName,
  setDriveIcon,
  setSharingType,
  setAvailableOffline,
  addListener,
  removeListener,
  addTrigger,
  removeTrigger,
} from "./creators";
import { DocumentDriveAction } from "../actions";

export default class DocumentDrive_Drive extends BaseDocument<
  DocumentDriveState,
  DocumentDriveAction,
  DocumentDriveLocalState
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
