import type {
  DocumentDriveAction,
  DocumentDriveLocalState,
  DocumentDriveState,
} from "document-drive";
import { driveCreateDocument, driveDocumentReducer } from "document-drive";
import type { BaseState, PartialState, SignalDispatch } from "document-model";
import { BaseDocumentClass } from "document-model";

export abstract class DocumentDriveCore extends BaseDocumentClass<
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
    super(driveDocumentReducer, driveCreateDocument(initialState), dispatch);
  }
  static async fromFile(path: string) {
    const document = new (this as any)();
    await document.loadFromFile(path);
    return document;
  }
}
