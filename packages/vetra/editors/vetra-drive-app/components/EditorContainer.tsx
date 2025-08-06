 
 
import {
    useDriveContext,
    type User,
    type DriveEditorContext,
  } from "@powerhousedao/reactor-browser";
  import {
    type DocumentModelModule,
    type EditorContext,
    type PHDocument,
    type EditorModule,
  } from "document-model";
  import {
    DefaultEditorLoader,
  } from "@powerhousedao/design-system";
  import { Suspense } from "react";
  
  export interface EditorContainerProps {
    driveId: string;
    documentId: string;
    documentType: string;
    context: Omit<DriveEditorContext, "getDocumentRevision"> &
      Pick<EditorContext, "getDocumentRevision">;
    documentModelModule: DocumentModelModule<PHDocument>;
    editorModule: EditorModule;
  }
  
  export const EditorContainer: React.FC<EditorContainerProps> = (props) => {
    const { driveId, documentId, documentType, context, documentModelModule, editorModule } = props;
  
    const { useDocumentEditorProps } = useDriveContext();
    const user = context.user as User | undefined;

    const { dispatch, error, document } = useDocumentEditorProps({
      documentId,
      documentType,
      driveId,
      documentModelModule,
      user,
    });
  
    const loadingContent = (
      <div className="flex-1 flex justify-center items-center h-full">
        <DefaultEditorLoader />
      </div>
    );
  
    if (!document) return loadingContent;
  
    const moduleWithComponent = editorModule as EditorModule<PHDocument>;
    const EditorComponent = moduleWithComponent.Component;
  
    return (
      <Suspense fallback={loadingContent}>
        <EditorComponent
          context={context}
          dispatch={dispatch}
          document={document}
          error={error}
        />
      </Suspense>
    );
  };