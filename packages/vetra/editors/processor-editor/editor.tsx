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

  const onConfirm = useCallback(
    (name: string, type: string, documentTypes: DocumentTypeItem[]) => {
      // Dispatch all actions at once
      dispatch(actions.setProcessorName({ name }));
      dispatch(actions.setProcessorType({ type }));
      documentTypes.forEach((dt) => {
        dispatch(
          actions.addDocumentType({ id: dt.id, documentType: dt.documentType }),
        );
      });
    },
    [dispatch],
  );

  return (
    <div>
      <ProcessorEditorForm
        processorName={document.state.global.name ?? ""}
        processorType={document.state.global.type ?? ""}
        documentTypes={document.state.global.documentTypes ?? []}
        onConfirm={onConfirm}
      />
    </div>
  );
}
