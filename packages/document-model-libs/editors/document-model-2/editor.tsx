import { ModelMetadataForm } from "./components/form/model-metadata-form";
import DocumentModelEditor from "./components/document-model-editor";
import { EditorProps } from "document-model/document";
import {
  DocumentModelState,
  DocumentModelAction,
  DocumentModelLocalState,
} from "document-model/document-model";
import { FormManager } from "./context/FormManager";
import { SchemaProvider } from "./context/SchemaContext";
import {
  DocumentModelProvider,
  useDocumentModel,
} from "./context/DocumentModelContext";

export type DocumentModelEditorProps = EditorProps<
  DocumentModelState,
  DocumentModelAction,
  DocumentModelLocalState
>;

export default function Editor(props: DocumentModelEditorProps) {
  return (
    <main className="mx-auto min-h-dvh max-w-screen-xl px-4 pt-8">
      <DocumentModelProvider {...props}>
        <SchemaProvider>
          <FormManager>
            <Container />
          </FormManager>
        </SchemaProvider>
      </DocumentModelProvider>
    </main>
  );
}

function Container() {
  const { hasSetInitialMetadata } = useDocumentModel();
  return hasSetInitialMetadata ? (
    <DocumentModelEditor />
  ) : (
    <ModelMetadataForm />
  );
}
