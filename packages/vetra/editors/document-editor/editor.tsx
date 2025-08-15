import type { EditorProps } from "document-model";
import {
  type DocumentEditorDocument,
  type AddDocumentTypeInput,
  type RemoveDocumentTypeInput,
  actions,
} from "../../document-models/document-editor/index.js";
import { DocumentEditorForm } from "./components/DocumentEditorForm.js";
import { useCallback } from "react";

export type IProps = EditorProps<DocumentEditorDocument>;

export default function Editor(props: IProps) {
  const { document, dispatch } = props;

  const onEditorNameChange = useCallback((name: string) => {
    if (name === document.state.global.name) return;
    dispatch(actions.setEditorName({ name }));
  }, [document.state.global.name, dispatch]);

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
        editorName={document.state.global.name ?? ""}
        documentTypes={document.state.global.documentTypes}
        status={document.state.global.status}
        onEditorNameChange={onEditorNameChange}
        onAddDocumentType={onAddDocumentType}
        onRemoveDocumentType={onRemoveDocumentType}
        onConfirm={onConfirm}
      />
    </div>
  );
}
