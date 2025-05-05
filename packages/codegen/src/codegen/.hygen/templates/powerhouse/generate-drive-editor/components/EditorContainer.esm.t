---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/components/EditorContainer.tsx"
unless_exists: true
---
import {
  useDriveContext,
  exportDocument,
  type User,
  type DriveEditorContext,
} from "@powerhousedao/reactor-browser";
import {
  type DocumentModelModule,
  type EditorModule,
  type EditorProps,
  type PHDocument,
} from "document-model";
import {
  DocumentToolbar,
  RevisionHistory,
  DefaultEditorLoader,
} from "@powerhousedao/design-system";
import { useState, Suspense, type FC, useCallback } from "react";

export interface EditorContainerProps {
  driveId: string;
  documentId: string;
  documentType: string;
  onClose: () => void;
  title: string;
  context: DriveEditorContext;
  documentModelModule: DocumentModelModule<PHDocument>;
  editorModule: EditorModule;
}

export const EditorContainer: React.FC<EditorContainerProps> = (props) => {
  const {
    title,
    driveId,
    context,
    onClose,
    documentId,
    documentType,
    editorModule,
    documentModelModule,
  } = props;

  const [showRevisionHistory, setShowRevisionHistory] = useState(false);
  const { useDocumentEditorProps } = useDriveContext();
  const user = context.user as User | undefined;

  const { dispatch, error, document } = useDocumentEditorProps({
    documentId,
    documentType,
    driveId,
    documentModelModule,
    user,
  });

  const onExport = useCallback(async () => {
    if (document) {
      const ext = documentModelModule.documentModel.extension;
      await exportDocument(document, title, ext);
    }
  }, [document?.revision.global, document?.revision.local]);

  const loadingContent = (
    <div className="flex-1 flex justify-center items-center h-full">
      <DefaultEditorLoader />
    </div>
  );

  if (!document) return loadingContent;

  const EditorComponent = editorModule.Component as FC<EditorProps<PHDocument>>;

  return showRevisionHistory ? (
    <RevisionHistory
      documentId={documentId}
      documentTitle={title}
      globalOperations={document.operations.global}
      key={documentId}
      localOperations={document.operations.local}
      onClose={() => setShowRevisionHistory(false)}
    />
  ) : (
    <Suspense fallback={loadingContent}>
      <DocumentToolbar
        onClose={onClose}
        onExport={onExport}
        onShowRevisionHistory={() => setShowRevisionHistory(true)}
        onSwitchboardLinkClick={() => {}}
        title={title}
      />
      <EditorComponent
        context={context}
        dispatch={dispatch}
        document={document}
        error={error}
      />
    </Suspense>
  );
}; 