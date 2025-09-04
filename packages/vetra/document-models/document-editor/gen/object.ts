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
}

applyMixins(DocumentEditor, [DocumentEditor_BaseOperations]);

export { DocumentEditor };
