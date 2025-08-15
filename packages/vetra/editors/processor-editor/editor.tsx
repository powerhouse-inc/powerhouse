import type { EditorProps } from "document-model";
import {
  type ProcessorModuleDocument,
  type DocumentTypeItem,
  actions,
} from "../../document-models/processor-module/index.js";
import { ProcessorEditorForm } from "./components/ProcessorEditorForm.js";
import { useCallback } from "react";

export type IProps = EditorProps<ProcessorModuleDocument>;

export default function Editor(props: IProps) {
  const { document, dispatch } = props;

  const onNameChange = useCallback((name: string) => {
    if (name === document.state.global.name) return;
    dispatch(actions.setProcessorName({ name }));
  }, [document.state.global.name, dispatch]);

  const onTypeChange = useCallback((type: string) => {
    if (type === document.state.global.type) return;
    dispatch(actions.setProcessorType({ type }));
  }, [document.state.global.type, dispatch]);

  const onAddDocumentType = useCallback((id: string, documentType: string) => {
    dispatch(actions.addDocumentType({ id, documentType }));
  }, [dispatch]);

  const onRemoveDocumentType = useCallback((id: string) => {
    dispatch(actions.removeDocumentType({ id }));
  }, [dispatch]);

  const onConfirm = useCallback(() => {
    dispatch(actions.setProcessorStatus({ status: "CONFIRMED" }));
  }, [dispatch]);

  return (
    <div>
      <ProcessorEditorForm
        processorName={document.state.global.name ?? ""}
        processorType={document.state.global.type ?? ""}
        documentTypes={document.state.global.documentTypes ?? []}
        status={document.state.global.status}
        onNameChange={onNameChange}
        onTypeChange={onTypeChange}
        onAddDocumentType={onAddDocumentType}
        onRemoveDocumentType={onRemoveDocumentType}
        onConfirm={onConfirm}
      />
    </div>
  );
}
