import type { EditorProps } from "document-model";
import { useCallback } from "react";
import type {
  AddDocumentTypeInput,
  RemoveDocumentTypeInput,
} from "../../document-models/document-editor/index.js";
import { actions } from "../../document-models/document-editor/index.js";
import { useDocumentEditorDocument } from "../hooks/useVetraDocument.js";
import { DocumentEditorForm } from "./components/DocumentEditorForm.js";

export type IProps = EditorProps;

export default function Editor(props: IProps) {
  const [document, dispatch] = useDocumentEditorDocument(props.documentId);

  const onEditorNameChange = useCallback(
    (name: string) => {
      if (!document.state.global.name && !name) return;
      if (name === document.state.global.name) return;

      dispatch(actions.setEditorName({ name }));
    },
    [document.state.global.name, dispatch],
  );

  const onAddDocumentType = useCallback(
    (input: AddDocumentTypeInput) => {
      dispatch(actions.addDocumentType(input));
    },
    [dispatch],
  );

  const onRemoveDocumentType = useCallback(
    (input: RemoveDocumentTypeInput) => {
      dispatch(actions.removeDocumentType(input));
    },
    [dispatch],
  );

  const onConfirm = useCallback(() => {
    dispatch(actions.setEditorStatus({ status: "CONFIRMED" }));
  }, [dispatch]);

  return (
    <div>
      <DocumentEditorForm
        status={document.state.global.status}
        editorName={document.state.global.name ?? ""}
        documentTypes={document.state.global.documentTypes}
        onEditorNameChange={onEditorNameChange}
        onAddDocumentType={onAddDocumentType}
        onRemoveDocumentType={onRemoveDocumentType}
        onConfirm={onConfirm}
      />
    </div>
  );
}
