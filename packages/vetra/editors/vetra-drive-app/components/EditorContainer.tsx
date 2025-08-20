 
 
import {
  DefaultEditorLoader,
} from "@powerhousedao/design-system";
import {
  useDocumentById,
  type IDriveContext,
  type VetraDocumentModelModule, type VetraEditorModule
} from "@powerhousedao/reactor-browser";
import { Suspense } from "react";
  
  export interface EditorContainerProps {
    driveId: string;
    documentId: string;
    documentType: string;
    context: IDriveContext;
    documentModelModule: VetraDocumentModelModule;
    editorModule: VetraEditorModule;
  }
  
  export const EditorContainer: React.FC<EditorContainerProps> = (props) => {
    const { context, editorModule, documentId } = props;
    const [document] = useDocumentById(documentId);
  
    const loadingContent = (
      <div className="flex-1 flex justify-center items-center h-full">
        <DefaultEditorLoader />
      </div>
    );
  
    if (!document) return loadingContent;
  
    const EditorComponent = editorModule.Component;
  
    return (
      <Suspense fallback={loadingContent}>
        <EditorComponent
          context={context}
          document={document}
          error={console.error}
        />
      </Suspense>
    );
  };