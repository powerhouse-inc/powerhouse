import type {
  AddListenerInput,
  AddTriggerInput,
  DocumentDriveAction,
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
import type {
  AbstractConstructor,
  AugmentConstructor,
  BaseDocumentClass,
} from "document-model";

export interface DocumentDrive_Drive_Augment<
  TAction extends DocumentDriveAction,
> {
  setDriveName(input: SetDriveNameInput): this;
  setDriveIcon(input: SetDriveIconInput): this;
  setSharingType(input: SetSharingTypeInput): this;
  setAvailableOffline(input: SetAvailableOfflineInput): this;
  addListener(input: AddListenerInput): this;
  removeListener(input: RemoveListenerInput): this;
  addTrigger(input: AddTriggerInput): this;
  removeTrigger(input: RemoveTriggerInput): this;
}

export function DocumentDrive_Drive<
  TGlobalState,
  TLocalState,
  TAction extends DocumentDriveAction,
  TBase extends AbstractConstructor<
    BaseDocumentClass<TGlobalState, TLocalState, TAction>
  >,
>(
  Base: TBase,
): AugmentConstructor<TBase, DocumentDrive_Drive_Augment<TAction>> {
  abstract class DocumentDrive_DriveClass extends Base {
    public setDriveName(input: SetDriveNameInput) {
      return this.dispatch(setDriveName(input) as TAction);
    }
    public setDriveIcon(input: SetDriveIconInput) {
      return this.dispatch(setDriveIcon(input) as TAction);
    }
    public setSharingType(input: SetSharingTypeInput) {
      return this.dispatch(setSharingType(input) as TAction);
    }
    public setAvailableOffline(input: SetAvailableOfflineInput) {
      return this.dispatch(setAvailableOffline(input) as TAction);
    }
    public addListener(input: AddListenerInput) {
      return this.dispatch(addListener(input) as TAction);
    }
    public removeListener(input: RemoveListenerInput) {
      return this.dispatch(removeListener(input) as TAction);
    }
    public addTrigger(input: AddTriggerInput) {
      return this.dispatch(addTrigger(input) as TAction);
    }
    public removeTrigger(input: RemoveTriggerInput) {
      return this.dispatch(removeTrigger(input) as TAction);
    }
  }
  return DocumentDrive_DriveClass as unknown as AugmentConstructor<
    TBase,
    DocumentDrive_Drive_Augment<TAction>
  >;
}
