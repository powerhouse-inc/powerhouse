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
  context: Omit<DriveEditorContext, "getDocumentRevision"> &
    Pick<EditorContext, "getDocumentRevision">;
  documentModelModule: DocumentModelModule<PHDocument>;
  editorModule: EditorModule;
}

/**
 * Document editor container that wraps individual document editors.
 * Handles document loading, toolbar, revision history, and dynamic editor loading.
 * Customize toolbar actions and editor context here.
 */
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

  // UI state for revision history and timeline
  const [selectedTimelineItem, setSelectedTimelineItem] =
    useState<TimelineItem | null>(null);
  const [showRevisionHistory, setShowRevisionHistory] = useState(false);
  const { useDocumentEditorProps } = useDriveContext();

  const user = context.user as User | undefined;

  // Document data and editor state
  const { dispatch, error, document } = useDocumentEditorProps({
    documentId,
    documentType,
    driveId,
    documentModelModule,
    user,
  });

  // Timeline data for revision history
  const timelineItems = useTimelineItems(
    documentId,
    document?.header.createdAtUtcIso,
    driveId,
  );

  // Document export functionality - customize export behavior here
  const onExport = useCallback(async () => {
    if (document) {
      const ext = documentModelModule.documentModel.extension;
      await exportDocument(document, title, ext);
    }
  }, [document?.header.revision.global, document?.header.revision.local]);

  // Loading state component
  const loadingContent = (
    <div className="flex-1 flex justify-center items-center h-full">
      <DefaultEditorLoader />
    </div>
  );

  if (!document) return loadingContent;

  // Dynamically load the appropriate editor component for this document type
  const EditorComponent = editorModule.Component as FC<EditorProps<PHDocument>>;

  return showRevisionHistory ? (
    // Revision history view
    <RevisionHistory
      documentId={documentId}
      documentTitle={title}
      globalOperations={document.operations.global}
      key={documentId}
      localOperations={document.operations.local}
      onClose={() => setShowRevisionHistory(false)}
    />
  ) : (
    // Main editor view
    <Suspense fallback={loadingContent}>
      {/* Document toolbar - customize available actions here */}
      <DocumentToolbar
        onClose={onClose}
        onExport={onExport}
        onShowRevisionHistory={() => setShowRevisionHistory(true)}
        onSwitchboardLinkClick={() => {}} // Customize switchboard integration
        title={title}
        timelineButtonVisible={editorModule.config.timelineEnabled}
        timelineItems={timelineItems.data}
        onTimelineItemClick={setSelectedTimelineItem}
      />
      {/* Dynamic editor component based on document type */}
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