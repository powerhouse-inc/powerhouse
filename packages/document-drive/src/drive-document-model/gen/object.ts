import {
  BaseDocumentClass,
  type PartialState,
  applyMixins,
  type SignalDispatch,
  type PHBaseState,
} from "document-model";
import {
  type DocumentDriveState,
  type DocumentDriveLocalState,
} from "./types.js";
import { type DocumentDriveAction } from "./actions.js";
import { DocumentDrivePHState } from "./ph-factories.js";
import { reducer } from "./reducer.js";
import utils from "./utils.js";
import DocumentDrive_Node from "./node/object.js";
import DocumentDrive_Drive from "./drive/object.js";

export * from "./node/object.js";
export * from "./drive/object.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface DocumentDrive extends DocumentDrive_Node, DocumentDrive_Drive {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class DocumentDrive extends BaseDocumentClass<DocumentDrivePHState> {
  static fileExtension = "phdd";

  constructor(
    initialState?: PartialState<DocumentDrivePHState>,
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
