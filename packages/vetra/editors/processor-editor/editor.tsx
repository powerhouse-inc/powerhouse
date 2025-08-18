import { useDocumentById } from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import { useCallback } from "react";
import {
  actions,
  type DocumentTypeItem, type ProcessorModuleDocument
} from "../../document-models/processor-module/index.js";
import { ProcessorEditorForm } from "./components/ProcessorEditorForm.js";

export type IProps = EditorProps;

export default function Editor(props: IProps) {
  const { document: initialDocument } = props;
  const [document, dispatch] = useDocumentById(initialDocument.header.id);
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
