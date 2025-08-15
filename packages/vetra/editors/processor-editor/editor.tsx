import type { EditorProps } from "document-model";
import {
  type ProcessorModuleDocument,
  type DocumentTypeItem,
  actions,
} from "../../document-models/processor-module/index.js";
import { ProcessorEditorForm } from "./components/ProcessorEditorForm.js";
import { useCallback } from "react";

export type IProps = EditorProps;

export default function Editor(props: IProps) {
  const { document, dispatch } = props;
 const unsafeCastOfDocument = document as ProcessorModuleDocument
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
        processorName={unsafeCastOfDocument.state.global.name ?? ""}
        processorType={unsafeCastOfDocument.state.global.type ?? ""}
        documentTypes={unsafeCastOfDocument.state.global.documentTypes ?? []}
        onConfirm={onConfirm}
      />
    </div>
  );
}
