import { BaseDocumentClass } from "document-model";
import { DocumentEditorPHState } from "../ph-factories.js";
import {
  type SetEditorNameInput,
  type AddDocumentTypeInput,
  type RemoveDocumentTypeInput,
  type SetEditorStatusInput,
} from "../types.js";
import {
  setEditorName,
  addDocumentType,
  removeDocumentType,
  setEditorStatus,
} from "./creators.js";
import { type DocumentEditorAction } from "../actions.js";

export default class DocumentEditor_BaseOperations extends BaseDocumentClass<DocumentEditorPHState> {
  public setEditorName(input: SetEditorNameInput) {
    return this.dispatch(setEditorName(input));
  }

  public addDocumentType(input: AddDocumentTypeInput) {
    return this.dispatch(addDocumentType(input));
  }

  public removeDocumentType(input: RemoveDocumentTypeInput) {
    return this.dispatch(removeDocumentType(input));
  }

  public setEditorStatus(input: SetEditorStatusInput) {
    return this.dispatch(setEditorStatus(input));
  }
}
