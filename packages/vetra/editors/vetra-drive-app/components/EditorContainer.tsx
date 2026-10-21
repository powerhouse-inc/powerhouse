import { DefaultEditorLoader } from "@powerhousedao/design-system/connect";
import {
  EditorDocumentProvider,
  useDocumentById,
  useEditorModuleFor,
} from "@powerhousedao/reactor-browser";
import { Suspense } from "react";

export interface EditorContainerProps {
  documentId: string;
}

const loadingContent = (
  <div className="flex h-full flex-1 items-center justify-center">
    <DefaultEditorLoader />
  </div>
);

function HostedEditor({ documentId }: { documentId: string }) {
  const [document, dispatch] = useDocumentById(documentId);
  const editorModule = useEditorModuleFor(document);
  if (!document) {
    return (
      <p role="alert" className="p-6 text-sm">
        The package document {documentId} was not found.
      </p>
    );
  }
  if (!editorModule) return loadingContent;
  const EditorComponent = editorModule.Component;
  return (
    <EditorDocumentProvider document={document} dispatch={dispatch}>
      <EditorComponent
        documentId={documentId}
        document={document}
        dispatch={dispatch}
        displayToolbar={false}
      />
    </EditorDocumentProvider>
  );
}

export const EditorContainer: React.FC<EditorContainerProps> = (props) => (
  <Suspense fallback={loadingContent}>
    <HostedEditor documentId={props.documentId} />
  </Suspense>
);
