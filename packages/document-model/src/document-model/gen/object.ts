import { DocumentModelLocalState, DocumentModelState } from "./types.js";
import { ExtendedState, PartialState, SignalDispatch } from "document-model";
import { applyMixins, BaseDocument } from "document-model";
import { DocumentModelAction } from "./actions.js";
import { reducer } from "./reducer.js";
import utils from "./utils.js";
import DocumentModel_Header from "./header/object.js";
import DocumentModel_Versioning from "./versioning/object";
import DocumentModel_Module from "./module/object";
import DocumentModel_OperationError from "./operation-error/object";
import DocumentModel_OperationExample from "./operation-example/object";
import DocumentModel_Operation from "./operation/object";
import DocumentModel_State from "./state/object";

export * from "./header/object";
export * from "./versioning/object";
export * from "./module/object";
export * from "./operation-error/object";
export * from "./operation-example/object";
export * from "./operation/object";
export * from "./state/object";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface DocumentModel
  extends DocumentModel_Header,
    DocumentModel_Versioning,
    DocumentModel_Module,
    DocumentModel_OperationError,
    DocumentModel_OperationExample,
    DocumentModel_Operation,
    DocumentModel_State {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class DocumentModel extends BaseDocument<
  DocumentModelState,
  DocumentModelAction,
  DocumentModelLocalState
> {
  static fileExtension = "phdm";

  constructor(
    initialState?: Partial<
      ExtendedState<
        PartialState<DocumentModelState>,
        PartialState<DocumentModelLocalState>
      >
    >,
    dispatch?: SignalDispatch,
  ) {
    super(reducer, utils.createDocument(initialState), dispatch);
  }

  public saveToFile(path: string, name?: string) {
    return super.saveToFile(path, DocumentModel.fileExtension, name);
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

applyMixins(DocumentModel, [
  DocumentModel_Header,
  DocumentModel_Versioning,
  DocumentModel_Module,
  DocumentModel_OperationError,
  DocumentModel_OperationExample,
  DocumentModel_Operation,
  DocumentModel_State,
]);

export { DocumentModel };
