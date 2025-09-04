import type {
  BaseStateFromDocument,
  DocumentModelAction,
  DocumentModelDocument,
  DocumentModelLocalState,
  DocumentModelState,
  SignalDispatch,
} from "document-model";
import {
  documentModelCreateDocument,
  documentModelFileExtension,
  documentModelReducer,
} from "document-model";

import { BaseDocumentClass } from "../../document/object.js";

export abstract class DocumentModelCore extends BaseDocumentClass<
  DocumentModelState,
  DocumentModelLocalState,
  DocumentModelAction
> {
  static fileExtension = documentModelFileExtension;

  constructor(
    initialState?: Partial<BaseStateFromDocument<DocumentModelDocument>>,
    dispatch?: SignalDispatch,
  ) {
    super(
      documentModelReducer,
      documentModelCreateDocument(initialState),
      dispatch,
    );
  }
}
