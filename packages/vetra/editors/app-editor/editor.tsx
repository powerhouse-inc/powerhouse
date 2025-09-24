import { useDocumentById } from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import { useCallback } from "react";
import type { AppModuleDocument } from "../../document-models/app-module/index.js";
import { actions } from "../../document-models/app-module/index.js";
import { AppEditorForm } from "./components/AppEditorForm.js";

export type IProps = EditorProps;

export default function Editor(props: IProps) {
  const { document: initialDocument } = props;
  const [document, dispatch] = useDocumentById(initialDocument.header.id);
  const unsafeCastOfDocument = document as AppModuleDocument;

  const onNameChange = useCallback(
    (name: string) => {
      if (name === unsafeCastOfDocument.state.global.name) return;
      dispatch(actions.setAppName({ name }));
    },
    [unsafeCastOfDocument.state.global.name, dispatch],
  );

  const onConfirm = useCallback(() => {
    dispatch(actions.setAppStatus({ status: "CONFIRMED" }));
  }, [dispatch]);

  const onDragAndDropToggle = useCallback(
    (enabled: boolean) => {
      if (enabled === unsafeCastOfDocument.state.global.dragAndDrop?.enabled)
        return;
      dispatch(actions.setDragAndDropEnabled({ enabled }));
    },
    [unsafeCastOfDocument.state.global.dragAndDrop?.enabled, dispatch],
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
        appName={unsafeCastOfDocument.state.global.name ?? ""}
        status={unsafeCastOfDocument.state.global.status}
        dragAndDropEnabled={
          unsafeCastOfDocument.state.global.dragAndDrop?.enabled ?? false
        }
        documentTypes={unsafeCastOfDocument.state.global.documentTypes ?? []}
        vetraDriveId={props.context.vetra?.driveId}
        onNameChange={onNameChange}
        onDragAndDropToggle={onDragAndDropToggle}
        onAddDocumentType={onAddDocumentType}
        onRemoveDocumentType={onRemoveDocumentType}
        onConfirm={onConfirm}
      />
    </div>
  );
}
