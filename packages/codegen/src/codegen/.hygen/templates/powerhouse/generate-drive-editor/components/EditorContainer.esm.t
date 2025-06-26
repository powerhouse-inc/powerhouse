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
  type EditorContext,
  type DocumentModelModule,
  type EditorModule,
  type EditorProps,
  type PHDocument,
} from "document-model";
import {
  DocumentToolbar,
  RevisionHistory,
  DefaultEditorLoader,
  type TimelineItem,
} from "@powerhousedao/design-system";
import { useTimelineItems, getRevisionFromDate } from "@powerhousedao/common";
import { useState, Suspense, type FC, useCallback } from "react";

export interface EditorContainerProps {
  driveId: string;
  documentId: string;
  documentType: string;
  onClose: () => void;
  title: string;
  context: Omit<DriveEditorContext, "getDocumentRevision"> & Pick<EditorContext, "getDocumentRevision">;
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

  const [selectedTimelineItem, setSelectedTimelineItem] = useState<TimelineItem | null>(null);
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

  const timelineItems = useTimelineItems(documentId, document?.created, driveId);

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
        timelineButtonVisible={editorModule.config.timelineEnabled}
        timelineItems={timelineItems.data}
        onTimelineItemClick={setSelectedTimelineItem}
      />
      <EditorComponent
        context={{
          ...context,
          readMode: !!selectedTimelineItem,
          selectedTimelineRevision: getRevisionFromDate(
            selectedTimelineItem?.startDate,
            selectedTimelineItem?.endDate,
            document.operations.global,
          ),
        }}
        dispatch={dispatch}
        document={document}
        error={error}
      />
    </Suspense>
  );
}; 