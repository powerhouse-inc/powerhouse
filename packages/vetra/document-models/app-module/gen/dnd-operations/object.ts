import { BaseDocumentClass } from "document-model";
import { AppModulePHState } from "../ph-factories.js";
import { type SetDragAndDropEnabledInput } from "../types.js";
import { setDragAndDropEnabled } from "./creators.js";
import { type AppModuleAction } from "../actions.js";

export default class AppModule_DndOperations extends BaseDocumentClass<AppModulePHState> {
  public setDragAndDropEnabled(input: SetDragAndDropEnabledInput) {
    return this.dispatch(setDragAndDropEnabled(input));
  }
}
