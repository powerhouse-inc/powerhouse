import {
  BaseDocumentClass,
  applyMixins,
  type SignalDispatch,
} from "document-model";
import { DocumentEditorPHState } from "./ph-factories.js";
import { type DocumentEditorAction } from "./actions.js";
import { reducer } from "./reducer.js";
import { createDocument } from "./utils.js";
import DocumentEditor_BaseOperations from "./base-operations/object.js";

export * from "./base-operations/object.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface DocumentEditor extends DocumentEditor_BaseOperations {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class DocumentEditor extends BaseDocumentClass<DocumentEditorPHState> {
  static fileExtension = ".phdm";

  constructor(
    initialState?: Partial<DocumentEditorPHState>,
    dispatch?: SignalDispatch,
  ) {
    super(reducer, createDocument(initialState), dispatch);
  }

  public saveToFile(path: string, name?: string) {
    return super.saveToFile(path, DocumentEditor.fileExtension, name);
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

applyMixins(DocumentEditor, [DocumentEditor_BaseOperations]);

export { DocumentEditor };
