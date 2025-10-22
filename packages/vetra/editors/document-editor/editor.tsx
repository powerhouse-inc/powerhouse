import { DocumentToolbar } from "@powerhousedao/design-system";
import { useSetPHDocumentEditorConfig } from "@powerhousedao/reactor-browser";
import { useCallback } from "react";
import type {
  AddDocumentTypeInput,
  RemoveDocumentTypeInput,
} from "../../document-models/document-editor/index.js";
import { actions } from "../../document-models/document-editor/index.js";
import { useSelectedDocumentEditorDocument } from "../hooks/useVetraDocument.js";
import { DocumentEditorForm } from "./components/DocumentEditorForm.js";
import { editorConfig } from "./config.js";

export function Editor() {
  useSetPHDocumentEditorConfig(editorConfig);
  const [document, dispatch] = useSelectedDocumentEditorDocument();

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
      <DocumentToolbar timelineButtonVisible />
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
