import { BaseDocumentClass } from "document-model";
import {
  type SetEditorNameInput,
  type SetEditorIdInput,
  type AddDocumentTypeInput,
  type RemoveDocumentTypeInput,
  type DocumentEditorState,
  type DocumentEditorLocalState,
} from "../types.js";
import {
  setEditorName,
  setEditorId,
  addDocumentType,
  removeDocumentType,
} from "./creators.js";
import { type DocumentEditorAction } from "../actions.js";

export default class DocumentEditor_BaseOperations extends BaseDocumentClass<
  DocumentEditorState,
  DocumentEditorLocalState,
  DocumentEditorAction
> {
  public setEditorName(input: SetEditorNameInput) {
    return this.dispatch(setEditorName(input));
  }

  public setEditorId(input: SetEditorIdInput) {
    return this.dispatch(setEditorId(input));
  }

  public addDocumentType(input: AddDocumentTypeInput) {
    return this.dispatch(addDocumentType(input));
  }

  public removeDocumentType(input: RemoveDocumentTypeInput) {
    return this.dispatch(removeDocumentType(input));
  }
}
