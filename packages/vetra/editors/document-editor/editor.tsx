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

  console.log(">>>>> document:", document.state.global);

  const onEditorNameChange = useCallback((name: string) => {
    if (!document.state.global.name && !name) return;
    if (name === document.state.global.name) return;

    dispatch(actions.setEditorName({ name }));
  }, [document.state.global.name, dispatch]);

  const onEditorIdChange = useCallback((id: string) => {
    if (!document.state.global.id && !id) return;
    if (id === document.state.global.id) return;

    dispatch(actions.setEditorId({ id }));
  }, [document.state.global.id, dispatch]);

  const onAddDocumentType = useCallback((input: AddDocumentTypeInput) => {
    dispatch(actions.addDocumentType(input));
  }, [dispatch]);

  const onRemoveDocumentType = useCallback((input: RemoveDocumentTypeInput) => {
    dispatch(actions.removeDocumentType(input));
  }, [dispatch]);

  return (
    <div>
      <DocumentEditorForm
        editorName={document.state.global.name ?? ""}
        editorId={document.state.global.id ?? ""}
        documentTypes={document.state.global.documentTypes}
        onEditorNameChange={onEditorNameChange}
        onEditorIdChange={onEditorIdChange}
        onAddDocumentType={onAddDocumentType}
        onRemoveDocumentType={onRemoveDocumentType}
      />
    </div>
  );
}
