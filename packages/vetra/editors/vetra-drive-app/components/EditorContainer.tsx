import { DefaultEditorLoader } from "@powerhousedao/design-system";
import type {
  VetraDocumentModelModule,
  VetraEditorModule,
} from "@powerhousedao/reactor-browser";
import { useDocumentById } from "@powerhousedao/reactor-browser";
import { Suspense } from "react";

export interface EditorContainerProps {
  driveId: string;
  documentId: string;
  documentType: string;
  documentModelModule: VetraDocumentModelModule;
  editorModule: VetraEditorModule;
}

export const EditorContainer: React.FC<EditorContainerProps> = (props) => {
  const { editorModule, documentId } = props;
  const [document, dispatch] = useDocumentById(documentId);

  const loadingContent = (
    <div className="flex h-full flex-1 items-center justify-center">
      <DefaultEditorLoader />
    </div>
  );

  if (!document) return loadingContent;

  const EditorComponent = editorModule.Component;

  return (
    <Suspense fallback={loadingContent}>
      <EditorComponent documentId={documentId} />
    </Suspense>
  );
};
