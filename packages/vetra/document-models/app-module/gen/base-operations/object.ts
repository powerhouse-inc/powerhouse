import { BaseDocumentClass } from "document-model";
import type {
  SetAppNameInput,
  SetAppStatusInput,
  AppModuleState,
  AppModuleLocalState,
} from "../types.js";
import { setAppName, setAppStatus } from "./creators.js";
import type { AppModuleAction } from "../actions.js";

export default class AppModule_BaseOperations extends BaseDocumentClass<AppModulePHState> {
  public setAppName(input: SetAppNameInput) {
    return this.dispatch(setAppName(input));
  }

  public setAppStatus(input: SetAppStatusInput) {
    return this.dispatch(setAppStatus(input));
  }
}
