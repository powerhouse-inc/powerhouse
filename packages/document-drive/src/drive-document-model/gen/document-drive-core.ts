import type {
  DocumentDriveAction,
  DocumentDriveLocalState,
  DocumentDriveState,
} from "document-drive";
import { driveDocumentReducer, DriveUtils } from "document-drive";
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
    super(
      driveDocumentReducer,
      DriveUtils.createDocument(initialState),
      dispatch,
    );
  }

  public saveToFile(path: string, name?: string) {
    return super.saveToFile(
      path,
      (this.constructor as typeof DocumentDriveCore).fileExtension,
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
