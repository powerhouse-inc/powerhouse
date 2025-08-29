import type {
  BaseStateFromDocument,
  DocumentModelAction,
  DocumentModelDocument,
  DocumentModelLocalState,
  DocumentModelState,
  SignalDispatch,
} from "document-model";
import {
  createDocument,
  documentModelReducer,
  fileExtension,
} from "document-model";

import { BaseDocumentClass } from "../../document/object.js";

export abstract class DocumentModelCore extends BaseDocumentClass<
  DocumentModelState,
  DocumentModelLocalState,
  DocumentModelAction
> {
  static fileExtension = fileExtension;

  constructor(
    initialState?: Partial<BaseStateFromDocument<DocumentModelDocument>>,
    dispatch?: SignalDispatch,
  ) {
    super(documentModelReducer, createDocument(initialState), dispatch);
  }

  public saveToFile(path: string, name?: string) {
    return super.saveToFile(
      path,
      (this.constructor as typeof DocumentModelCore).fileExtension,
      name,
    );
  }

  public loadFromFile(path: string) {
    return super.loadFromFile(path);
  }

  static async fromFile(path: string) {
    const document = new (this as any)();
    await document.loadFromFile(path);
    return document;
  }
}
