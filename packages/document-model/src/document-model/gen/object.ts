import type { BaseStateFromDocument, SignalDispatch } from "document-model";
import { applyMixins, BaseDocumentClass } from "document-model";
import type { DocumentModelAction } from "./actions.js";
import { fileExtension } from "./constants.js";
import DocumentModel_Header from "./header/object.js";
import DocumentModel_Module from "./module/object.js";
import DocumentModel_OperationError from "./operation-error/object.js";
import DocumentModel_OperationExample from "./operation-example/object.js";
import DocumentModel_Operation from "./operation/object.js";
import { documentModelReducer } from "./reducer.js";
import DocumentModel_State from "./state/object.js";
import type {
  DocumentModelDocument,
  DocumentModelLocalState,
  DocumentModelState,
} from "./types.js";
import { createDocument } from "./utils.js";
import DocumentModel_Versioning from "./versioning/object.js";

export * from "./header/object.js";
export * from "./module/object.js";
export * from "./operation-error/object.js";
export * from "./operation-example/object.js";
export * from "./operation/object.js";
export * from "./state/object.js";
export * from "./versioning/object.js";

interface DocumentModelClass
  extends DocumentModel_Header,
    DocumentModel_Versioning,
    DocumentModel_Module,
    DocumentModel_OperationError,
    DocumentModel_OperationExample,
    DocumentModel_Operation,
    DocumentModel_State {}

class DocumentModelClass extends BaseDocumentClass<
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
    return super.saveToFile(path, DocumentModelClass.fileExtension, name);
  }

  public loadFromFile(path: string) {
    return super.loadFromFile(path);
  }

  static async fromFile(path: string) {
    const document = new this();
    await document.loadFromFile(path);
    return document;
  }
}

applyMixins(DocumentModelClass, [
  DocumentModel_Header,
  DocumentModel_Versioning,
  DocumentModel_Module,
  DocumentModel_OperationError,
  DocumentModel_OperationExample,
  DocumentModel_Operation,
  DocumentModel_State,
]);

export { DocumentModelClass };
