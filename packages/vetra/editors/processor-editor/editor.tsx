import { useDocumentById } from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import { useCallback } from "react";
import type { ProcessorModuleDocument } from "../../document-models/processor-module/index.js";
import { actions } from "../../document-models/processor-module/index.js";
import { ProcessorEditorForm } from "./components/ProcessorEditorForm.js";

export type IProps = EditorProps;

export default function Editor(props: IProps) {
  const { document: initialDocument } = props;
  const [document, dispatch] = useDocumentById(initialDocument.header.id);
  const unsafeCastOfDocument = document as ProcessorModuleDocument;
  const onConfirm = useCallback(() => {
    // Dispatch all actions at once
    dispatch([actions.setProcessorStatus({ status: "CONFIRMED" })]);
  }, [dispatch]);

  const onNameChange = useCallback(
    (name: string) => {
      if (name === unsafeCastOfDocument.state.global.name) return;
      dispatch(actions.setProcessorName({ name }));
    },
    [unsafeCastOfDocument.state.global.name, dispatch],
  );

  const onTypeChange = useCallback(
    (type: string) => {
      if (type === unsafeCastOfDocument.state.global.type) return;
      dispatch(actions.setProcessorType({ type }));
    },
    [unsafeCastOfDocument.state.global.type, dispatch],
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
      <ProcessorEditorForm
        onNameChange={onNameChange}
        onTypeChange={onTypeChange}
        onAddDocumentType={onAddDocumentType}
        onRemoveDocumentType={onRemoveDocumentType}
        status={unsafeCastOfDocument.state.global.status}
        processorName={unsafeCastOfDocument.state.global.name ?? ""}
        processorType={unsafeCastOfDocument.state.global.type ?? ""}
        documentTypes={unsafeCastOfDocument.state.global.documentTypes ?? []}
        onConfirm={onConfirm}
      />
    </div>
  );
}
