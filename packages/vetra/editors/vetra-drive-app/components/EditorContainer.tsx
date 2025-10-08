import { DefaultEditorLoader } from "@powerhousedao/design-system";
import { useEditorModuleById } from "@powerhousedao/reactor-browser";
import { Suspense } from "react";

export interface EditorContainerProps {
  documentId: string;
}

export const EditorContainer: React.FC<EditorContainerProps> = (props) => {
  const { documentId } = props;

  const editorModule = useEditorModuleById("vetra-package-editor");

  const loadingContent = (
    <div className="flex h-full flex-1 items-center justify-center">
      <DefaultEditorLoader />
    </div>
  );

  if (!editorModule) return loadingContent;

  const EditorComponent = editorModule.Component;

  return (
    <Suspense fallback={loadingContent}>
      <EditorComponent documentId={documentId} />
    </Suspense>
  );
};
