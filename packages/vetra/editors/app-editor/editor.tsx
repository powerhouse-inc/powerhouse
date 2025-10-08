import {
  setIsDragAndDropEnabled,
  useIsDragAndDropEnabled,
} from "@powerhousedao/reactor-browser";
import { useCallback } from "react";
import { actions } from "../../document-models/app-module/index.js";
import { useSelectedAppModuleDocument } from "../hooks/useVetraDocument.js";
import { AppEditorForm } from "./components/AppEditorForm.js";

export function Editor() {
  const [document, dispatch] = useSelectedAppModuleDocument();
  const isDragAndDropEnabled = useIsDragAndDropEnabled();
  const onNameChange = useCallback(
    (name: string) => {
      if (name === document.state.global.name) return;
      dispatch(actions.setAppName({ name }));
    },
    [document.state.global.name, dispatch],
  );

  const onConfirm = useCallback(() => {
    dispatch(actions.setAppStatus({ status: "CONFIRMED" }));
  }, [dispatch]);

  function onDragAndDropToggle(enabled: boolean) {
    setIsDragAndDropEnabled(enabled);
  }

  const onAddDocumentType = useCallback(
    (id: string, documentType: string) => {
      dispatch(actions.addDocumentType({ id, documentType }));
    },
    [dispatch],
  );

  const onRemoveDocumentType = useCallback(
    (id: string) => {
      dispatch(actions.removeDocumentType({ id }));
    },
    [dispatch],
  );

  return (
    <div>
      <AppEditorForm
        appName={document.state.global.name ?? ""}
        status={document.state.global.status}
        dragAndDropEnabled={isDragAndDropEnabled}
        documentTypes={document.state.global.documentTypes ?? []}
        onNameChange={onNameChange}
        onDragAndDropToggle={onDragAndDropToggle}
        onAddDocumentType={onAddDocumentType}
        onRemoveDocumentType={onRemoveDocumentType}
        onConfirm={onConfirm}
      />
    </div>
  );
}
