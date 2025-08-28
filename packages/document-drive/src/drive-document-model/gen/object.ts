import type {
  DocumentDriveAction,
  DocumentDriveLocalState,
  DocumentDriveState,
} from "document-drive";
import {
  DocumentDrive_Drive,
  DocumentDrive_Node,
  driveDocumentReducer,
  DriveUtils,
} from "document-drive";
import type { BaseState, PartialState, SignalDispatch } from "document-model";
import { applyMixins, BaseDocumentClass } from "document-model";

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
    super(
      driveDocumentReducer,
      DriveUtils.createDocument(initialState),
      dispatch,
    );
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
