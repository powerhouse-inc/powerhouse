import {
  applyMixins,
  BaseDocumentClass,
  ExtendedState,
  PartialState,
  SignalDispatch,
} from "document-model";
import { DocumentDriveAction } from "./actions.js";
import { fileExtension } from "./constants.js";
import DocumentDrive_Drive from "./drive/object.js";
import DocumentDrive_Node from "./node/object.js";
import { reducer } from "./reducer.js";
import { DocumentDriveLocalState, DocumentDriveState } from "./types.js";
import { createDocument } from "./utils.js";

export * from "./drive/object.js";
export * from "./node/object.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface DocumentDriveClass extends DocumentDrive_Node, DocumentDrive_Drive {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class DocumentDriveClass extends BaseDocumentClass<
  DocumentDriveState,
  DocumentDriveLocalState,
  DocumentDriveAction
> {
  static fileExtension = fileExtension;

  constructor(
    initialState?: Partial<
      ExtendedState<
        PartialState<DocumentDriveState>,
        PartialState<DocumentDriveLocalState>
      >
    >,
    dispatch?: SignalDispatch,
  ) {
    super(reducer, createDocument(initialState), dispatch);
  }

  public saveToFile(path: string, name?: string) {
    return super.saveToFile(path, DocumentDriveClass.fileExtension, name);
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

applyMixins(DocumentDriveClass, [DocumentDrive_Node, DocumentDrive_Drive]);

export { DocumentDriveClass };
