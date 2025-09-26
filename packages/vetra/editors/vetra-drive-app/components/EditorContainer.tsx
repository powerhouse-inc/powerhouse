import { DefaultEditorLoader } from "@powerhousedao/design-system";
import type {
  VetraDocumentModelModule,
  VetraEditorModule,
} from "@powerhousedao/reactor-browser";
import { useDocumentById } from "@powerhousedao/reactor-browser";
import type { EditorContext } from "document-model";
import { Suspense } from "react";

export interface EditorContainerProps {
  driveId: string;
  documentId: string;
  documentType: string;
  context: EditorContext;
  documentModelModule: VetraDocumentModelModule;
  editorModule: VetraEditorModule;
}

export const EditorContainer: React.FC<EditorContainerProps> = (props) => {
  const { context, editorModule, documentId } = props;
  const [document] = useDocumentById(documentId);

  const loadingContent = (
    <div className="flex h-full flex-1 items-center justify-center">
      <DefaultEditorLoader />
    </div>
  );

  if (!document) return loadingContent;

  const EditorComponent = editorModule.Component;

  return (
    <Suspense fallback={loadingContent}>
      <EditorComponent context={context} documentId={documentId} />
    </Suspense>
  );
};
