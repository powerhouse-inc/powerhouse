import {
    DocumentModelAction,
    DocumentModelLocalState,
    DocumentModelState,
} from "@document-model/gen/types.js";
import { BaseDocumentClass } from "@document/object.js";
import { ReducerOptions } from "@document/types.js";
import { SetAuthorNameInput, SetAuthorWebsiteInput, SetModelDescriptionInput, SetModelExtensionInput, SetModelIdInput, SetModelNameInput } from "../schema/types.js";
import {
    setAuthorName,
    setAuthorWebsite,
    setModelDescription,
    setModelExtension,
    setModelId,
    setModelName,
} from "./creators.js";

export default class DocumentModel_Header extends BaseDocumentClass<
  DocumentModelState,
  DocumentModelLocalState,
  DocumentModelAction
> {
  public setModelName(input: SetModelNameInput, options?: ReducerOptions) {
    return this.dispatch(setModelName(input), options);
  }

  public setModelId(input: SetModelIdInput, options?: ReducerOptions) {
    return this.dispatch(setModelId(input), options);
  }

  public setModelExtension(
    input: SetModelExtensionInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(setModelExtension(input), options);
  }

  public setModelDescription(
    input: SetModelDescriptionInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(setModelDescription(input), options);
  }

  public setAuthorName(input: SetAuthorNameInput, options?: ReducerOptions) {
    return this.dispatch(setAuthorName(input), options);
  }

  public setAuthorWebsite(
    input: SetAuthorWebsiteInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(setAuthorWebsite(input), options);
  }
}
