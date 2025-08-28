import type { BaseStateFromDocument, SignalDispatch } from "document-model";
import { applyMixins, BaseDocumentClass } from "document-model";
import type { DocumentEditorAction } from "./actions.js";
import DocumentEditor_BaseOperations from "./base-operations/object.js";
import { reducer } from "./reducer.js";
import type {
  DocumentEditorDocument,
  DocumentEditorLocalState,
  DocumentEditorState,
} from "./types.js";
import utils from "./utils.js";

export * from "./base-operations/object.js";

interface DocumentEditor extends DocumentEditor_BaseOperations {}

class DocumentEditor extends BaseDocumentClass<
  DocumentEditorState,
  DocumentEditorLocalState,
  DocumentEditorAction
> {
  static fileExtension = ".phdm";

  constructor(
    initialState?: Partial<BaseStateFromDocument<DocumentEditorDocument>>,
    dispatch?: SignalDispatch,
  ) {
    super(reducer, utils.createDocument(initialState), dispatch);
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
