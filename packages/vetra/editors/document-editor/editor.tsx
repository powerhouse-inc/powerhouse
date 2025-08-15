import type { EditorProps } from "document-model";
import { useCallback } from "react";
import {
  type AddDocumentTypeInput,
  type DocumentEditorDocument,
  type RemoveDocumentTypeInput,
  actions,
} from "../../document-models/document-editor/index.js";
import { DocumentEditorForm } from "./components/DocumentEditorForm.js";

export type IProps = EditorProps;

export default function Editor(props: IProps) {
  const { document, dispatch } = props;
 const unsafeCastOfDocument = document as DocumentEditorDocument
  console.log(">>>>> document:", unsafeCastOfDocument.state.global);

  const onEditorNameChange = useCallback((name: string) => {
    if (!unsafeCastOfDocument.state.global.name && !name) return;
    if (name === unsafeCastOfDocument.state.global.name) return;

    dispatch(actions.setEditorName({ name }));
  }, [unsafeCastOfDocument.state.global.name, dispatch]);

  const onEditorIdChange = useCallback((id: string) => {
    if (!unsafeCastOfDocument.state.global.id && !id) return;
    if (id === unsafeCastOfDocument.state.global.id) return;

    dispatch(actions.setEditorId({ id }));
  }, [unsafeCastOfDocument.state.global.id, dispatch]);

  const onAddDocumentType = useCallback((input: AddDocumentTypeInput) => {
    dispatch(actions.addDocumentType(input));
  }, [dispatch]);

  const onRemoveDocumentType = useCallback((input: RemoveDocumentTypeInput) => {
    dispatch(actions.removeDocumentType(input));
  }, [dispatch]);

  return (
    <div>
      <DocumentEditorForm
        editorName={unsafeCastOfDocument.state.global.name ?? ""}
        editorId={unsafeCastOfDocument.state.global.id ?? ""}
        documentTypes={unsafeCastOfDocument.state.global.documentTypes}
        onEditorNameChange={onEditorNameChange}
        onEditorIdChange={onEditorIdChange}
        onAddDocumentType={onAddDocumentType}
        onRemoveDocumentType={onRemoveDocumentType}
      />
    </div>
  );
}
