import { BaseDocumentClass } from "document-model";
import { AppModulePHState } from "../ph-factories.js";
import {
  type SetDragAndDropEnabledInput,
  type AddDocumentTypeInput,
  type RemoveDocumentTypeInput,
} from "../types.js";
import {
  setDragAndDropEnabled,
  addDocumentType,
  removeDocumentType,
} from "./creators.js";
import { type AppModuleAction } from "../actions.js";

export default class AppModule_DndOperations extends BaseDocumentClass<AppModulePHState> {
  public setDragAndDropEnabled(input: SetDragAndDropEnabledInput) {
    return this.dispatch(setDragAndDropEnabled(input));
  }

  public addDocumentType(input: AddDocumentTypeInput) {
    return this.dispatch(addDocumentType(input));
  }

  public removeDocumentType(input: RemoveDocumentTypeInput) {
    return this.dispatch(removeDocumentType(input));
  }
}
