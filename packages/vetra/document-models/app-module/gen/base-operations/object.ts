import { BaseDocumentClass } from "document-model";
import { AppModulePHState } from "../ph-factories.js";
import {
  type SetAppNameInput,
  type SetAppStatusInput,
  type AddDocumentTypeInput,
  type RemoveDocumentTypeInput,
} from "../types.js";
import {
  setAppName,
  setAppStatus,
  addDocumentType,
  removeDocumentType,
} from "./creators.js";
import { type AppModuleAction } from "../actions.js";

export default class AppModule_BaseOperations extends BaseDocumentClass<AppModulePHState> {
  public setAppName(input: SetAppNameInput) {
    return this.dispatch(setAppName(input));
  }

  public setAppStatus(input: SetAppStatusInput) {
    return this.dispatch(setAppStatus(input));
  }

  public addDocumentType(input: AddDocumentTypeInput) {
    return this.dispatch(addDocumentType(input));
  }

  public removeDocumentType(input: RemoveDocumentTypeInput) {
    return this.dispatch(removeDocumentType(input));
  }
}
