import {
  BaseDocument,
  ExtendedState,
  PartialState,
  applyMixins,
  SignalDispatch,
} from "document-model/document";
import { DocumentDriveState, DocumentDriveLocalState } from "./types";
import { DocumentDriveAction } from "./actions";
import { reducer } from "./reducer";
import utils from "./utils";
import DocumentDrive_Node from "./node/object";
import DocumentDrive_Drive from "./drive/object";

export * from "./node/object";
export * from "./drive/object";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface DocumentDrive extends DocumentDrive_Node, DocumentDrive_Drive {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class DocumentDrive extends BaseDocument<
  DocumentDriveState,
  DocumentDriveAction,
  DocumentDriveLocalState
> {
  static fileExtension = "phdd";

  constructor(
    initialState?: Partial<
      ExtendedState<
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
