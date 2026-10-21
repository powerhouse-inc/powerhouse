import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import type { EditorProps } from "@powerhousedao/shared/document-model";
import type {
  DocumentEditorAction,
  DocumentEditorDocument,
} from "../../document-models/document-editor/index.js";
import { useSetPHDocumentEditorConfig } from "@powerhousedao/reactor-browser";
import { useCallback } from "react";
import {
  addDocumentType,
  removeDocumentType,
  setEditorName,
  setEditorStatus,
  type AddDocumentTypeInput,
  type RemoveDocumentTypeInput,
} from "../../document-models/document-editor/index.js";
import { DocumentEditorForm } from "./components/DocumentEditorForm.js";
import { editorConfig } from "./config.js";

export default function Editor({
  document,
  dispatch,
}: EditorProps<DocumentEditorDocument, DocumentEditorAction>) {
  useSetPHDocumentEditorConfig(editorConfig);

  const onEditorNameChange = useCallback(
    (name: string) => {
      if (!document.state.global.name && !name) return;
      if (name === document.state.global.name) return;

      dispatch(setEditorName({ name }));
    },
    [document.state.global.name, dispatch],
  );

  const onAddDocumentType = useCallback(
    (input: AddDocumentTypeInput) => {
      dispatch(addDocumentType(input));
    },
    [dispatch],
  );

  const onRemoveDocumentType = useCallback(
    (input: RemoveDocumentTypeInput) => {
      dispatch(removeDocumentType(input));
    },
    [dispatch],
  );

  const onConfirm = useCallback(() => {
    dispatch(setEditorStatus({ status: "CONFIRMED" }));
  }, [dispatch]);

  return (
    <div className="bg-background p-6">
      <DocumentToolbar document={document} />
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
