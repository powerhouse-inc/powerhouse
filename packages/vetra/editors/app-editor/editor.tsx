import type { EditorProps } from "document-model";
import { useCallback } from "react";
import { actions } from "../../document-models/app-module/index.js";
import { useAppModuleDocument } from "../hooks/useVetraDocument.js";
import { AppEditorForm } from "./components/AppEditorForm.js";

export type IProps = EditorProps;

export default function Editor(props: IProps) {
  const [document, dispatch] = useAppModuleDocument(props.documentId);

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

  const onDragAndDropToggle = useCallback(
    (enabled: boolean) => {
      if (enabled === document.state.global.dragAndDrop?.enabled) return;
      dispatch(actions.setDragAndDropEnabled({ enabled }));
    },
    [document.state.global.dragAndDrop?.enabled, dispatch],
  );

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
        dragAndDropEnabled={document.state.global.dragAndDrop?.enabled ?? false}
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
