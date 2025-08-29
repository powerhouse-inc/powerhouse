import type {
  BaseStateFromDocument,
  DocumentModelAction,
  DocumentModelDocument,
  DocumentModelLocalState,
  DocumentModelState,
  SignalDispatch,
} from "document-model";
import {
  applyMixins,
  BaseDocumentClass,
  createDocument,
  DocumentModel_Header,
  DocumentModel_Module,
  DocumentModel_Operation,
  DocumentModel_OperationError,
  DocumentModel_OperationExample,
  DocumentModel_State,
  DocumentModel_Versioning,
  documentModelReducer,
  fileExtension,
} from "document-model";

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
