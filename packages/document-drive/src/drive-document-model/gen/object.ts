import {
  applyMixins,
  BaseDocumentClass,
  type BaseState,
  type PartialState,
  type SignalDispatch,
} from "document-model";
import { type DocumentDriveAction } from "./actions.js";
import DocumentDrive_Drive from "./drive/object.js";
import DocumentDrive_Node from "./node/object.js";
import { reducer } from "./reducer.js";
import {
  type DocumentDriveLocalState,
  type DocumentDriveState,
} from "./types.js";
import * as utils from "./utils.js";

export * from "./drive/object.js";
export * from "./node/object.js";

interface DocumentDrive extends DocumentDrive_Node, DocumentDrive_Drive {}

class DocumentDrive extends BaseDocumentClass<
  DocumentDriveState,
  DocumentDriveLocalState,
  DocumentDriveAction
> {
  static fileExtension = "phdd";

  constructor(
    initialState?: Partial<
      BaseState<
        PartialState<DocumentDriveState>,
        PartialState<DocumentDriveLocalState>
      >
    >,
    dispatch?: SignalDispatch,
  ) {
    super(reducer, utils.createDocument(initialState), dispatch);
  }

  public saveToFile(path: string, name?: string) {
    return super.saveToFile(path, DocumentDrive.fileExtension, name);
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

applyMixins(DocumentDrive, [DocumentDrive_Node, DocumentDrive_Drive]);

export { DocumentDrive };
