import { useDocumentById } from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import { useCallback } from "react";
import {
  type AddDocumentTypeInput, type DocumentEditorDocument,
  type RemoveDocumentTypeInput,
  actions
} from "../../document-models/document-editor/index.js";
import { DocumentEditorForm } from "./components/DocumentEditorForm.js";

export type IProps = EditorProps;

export default function Editor(props: IProps) {
  const { document: initialDocument } = props;
  const [document, dispatch] = useDocumentById(initialDocument.header.id);
 const unsafeCastOfDocument = document as DocumentEditorDocument
  console.log(">>>>> document:", unsafeCastOfDocument.state.global);

  const onEditorNameChange = useCallback((name: string) => {
    if (!unsafeCastOfDocument.state.global.name && !name) return;
    if (name === unsafeCastOfDocument.state.global.name) return;

    dispatch(actions.setEditorName({ name }));
  }, [unsafeCastOfDocument.state.global.name, dispatch]);

  const onAddDocumentType = useCallback((input: AddDocumentTypeInput) => {
    dispatch(actions.addDocumentType(input));
  }, [dispatch]);

  const onRemoveDocumentType = useCallback((input: RemoveDocumentTypeInput) => {
    dispatch(actions.removeDocumentType(input));
  }, [dispatch]);

  const onConfirm = useCallback(() => {
    dispatch(actions.setEditorStatus({ status: "CONFIRMED" }));
  }, [dispatch]);

  return (
    <div>
      <DocumentEditorForm
        status={unsafeCastOfDocument.state.global.status}
        editorName={unsafeCastOfDocument.state.global.name ?? ""}
        documentTypes={unsafeCastOfDocument.state.global.documentTypes}
        onEditorNameChange={onEditorNameChange}
        onAddDocumentType={onAddDocumentType}
        onRemoveDocumentType={onRemoveDocumentType}
        onConfirm={onConfirm}
      />
    </div>
  );
}
