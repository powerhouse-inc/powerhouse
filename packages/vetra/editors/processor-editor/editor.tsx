import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { useSetPHDocumentEditorConfig } from "@powerhousedao/reactor-browser";
import { useCallback } from "react";
import { actions } from "../../document-models/processor-module/index.js";
import { useSelectedProcessorModuleDocument } from "../hooks/useVetraDocument.js";
import { ProcessorEditorForm } from "./components/ProcessorEditorForm.js";
import { editorConfig } from "./config.js";

export default function Editor() {
  useSetPHDocumentEditorConfig(editorConfig);
  const [document, dispatch] = useSelectedProcessorModuleDocument();

  const onConfirm = useCallback(() => {
    // Dispatch all actions at once
    dispatch([actions.setProcessorStatus({ status: "CONFIRMED" })]);
  }, [dispatch]);

  const onNameChange = useCallback(
    (name: string) => {
      if (name === document.state.global.name) return;
      dispatch(actions.setProcessorName({ name }));
    },
    [document.state.global.name, dispatch],
  );

  const onTypeChange = useCallback(
    (type: string) => {
      if (type === document.state.global.type) return;
      dispatch(actions.setProcessorType({ type }));
    },
    [document.state.global.type, dispatch],
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
    <div className="bg-gray-50 p-6">
      <DocumentToolbar />
      <ProcessorEditorForm
        onNameChange={onNameChange}
        onTypeChange={onTypeChange}
        onAddDocumentType={onAddDocumentType}
        onRemoveDocumentType={onRemoveDocumentType}
        status={document.state.global.status}
        processorName={document.state.global.name ?? ""}
        processorType={document.state.global.type ?? ""}
        documentTypes={document.state.global.documentTypes ?? []}
        onConfirm={onConfirm}
      />
    </div>
  );
}
