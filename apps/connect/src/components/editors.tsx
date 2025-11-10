import { EditorLoader } from "@powerhousedao/connect/components/editor-loader";
import { useUndoRedoShortcuts } from "@powerhousedao/connect/hooks/useUndoRedoShortcuts";
import { toast } from "@powerhousedao/connect/services/toast";
import { RevisionHistory } from "@powerhousedao/design-system/connect";
import {
  getRevisionFromDate,
  setRevisionHistoryVisible,
  showPHModal,
  useDocumentById,
  useDocumentModelModuleById,
  useEditorModuleById,
  useFallbackEditorModule,
  useIsExternalControlsEnabled,
  useRevisionHistoryVisible,
  useSelectedTimelineItem,
} from "@powerhousedao/reactor-browser";
import type { PHDocument } from "document-model";
import { redo, undo } from "document-model/core";
import { Suspense, useEffect, useState } from "react";
import type { FallbackProps } from "react-error-boundary";
import { ErrorBoundary } from "react-error-boundary";

type Props<TDocument extends PHDocument = PHDocument> = {
  document: TDocument;
  onClose: () => void;
  onExport: () => void;
  onOpenSwitchboardLink?: () => Promise<void>;
};

function EditorError({ message }: { message: React.ReactNode }) {
  return (
    <div className="flex size-full items-center justify-center">
      <h3 className="text-lg font-semibold">{message}</h3>
    </div>
  );
}

function FallbackEditorError(props: FallbackProps) {
  const message =
    props.error instanceof Error
      ? props.error.message
      : (props.error as string);
  return <EditorError message={message} />;
}

export const DocumentEditor: React.FC<Props> = (props) => {
  const {
    document: initialDocument,
    onClose,
    onExport,
    onOpenSwitchboardLink,
  } = props;
  const selectedTimelineItem = useSelectedTimelineItem();
  const revisionHistoryVisible = useRevisionHistoryVisible();
  const [document, dispatch] = useDocumentById(initialDocument.header.id);
  const documentId = document?.header.id ?? undefined;
  const documentName = document?.header.name ?? undefined;
  const documentType = document?.header.documentType ?? undefined;
  const preferredEditor = document?.header.meta?.preferredEditor ?? undefined;
  const globalOperations = document?.operations.global ?? [];
  const localOperations = document?.operations.local ?? [];
  const globalRevisionNumber = document?.header.revision.global ?? 0;
  const localRevisionNumber = document?.header.revision.local ?? 0;
  const documentModelModule = useDocumentModelModuleById(documentType);
  const preferredEditorModule = useEditorModuleById(preferredEditor);
  const fallbackEditorModule = useFallbackEditorModule(documentType);
  const editorModule = preferredEditorModule ?? fallbackEditorModule;
  const isExternalControlsEnabled = useIsExternalControlsEnabled();
  const isLoadingDocument = !document;
  const isLoadingEditor =
    editorModule === undefined ||
    (editorModule &&
      documentType &&
      !editorModule.documentTypes.includes(documentType) &&
      !editorModule.documentTypes.includes("*"));

  const canUndo = globalRevisionNumber > 0 || localRevisionNumber > 0;
  const canRedo = !!document?.clipboard.length;
  const addUndoAction = () => dispatch(undo());
  const addRedoAction = () => dispatch(redo());
  useUndoRedoShortcuts({
    undo: addUndoAction,
    redo: addRedoAction,
    canUndo,
    canRedo,
  });

  useEffect(() => {
    return () => {
      window.documentEditorDebugTools?.clear();
    };
  }, []);

  const [editorError, setEditorError] = useState<
    | {
        error: any;
        info: React.ErrorInfo;
        documentId?: string;
        //   clear: () => void;
      }
    | undefined
  >(undefined);

  useEffect(() => {
    if (editorError && editorError.documentId !== documentId) {
      setEditorError(undefined);
    }
  }, [editorError, documentId]);

  const handleEditorError = (error: Error, info: React.ErrorInfo) => {
    setEditorError({
      error,
      documentId,
      info,
    });
  };

  if (isLoadingEditor) {
    return <EditorLoader message="Loading editor" />;
  }

  if (isLoadingDocument) {
    return <EditorLoader message="Loading document" />;
  }

  if (!documentModelModule) {
    return (
      <EditorError
        message={
          <div className="text-center leading-10">
            <p>
              Unable to open the document because the document model "
              {documentType}" is not supported.
            </p>
            <p>
              Go to the{" "}
              <button
                type="button"
                className="cursor-pointer underline"
                onClick={() => {
                  showPHModal({ type: "settings" });
                }}
              >
                package manager
              </button>{" "}
              to install this document model
            </p>
          </div>
        }
      />
    );
  }

  if (!editorModule) {
    return (
      <EditorError
        message={
          <div className="text-center leading-10">
            <p>Unable to open the document because no editor has been found</p>
            <p>
              Go to the{" "}
              <button
                type="button"
                className="cursor-pointer underline"
                onClick={() => {
                  showPHModal({ type: "settings" });
                }}
              >
                package manager
              </button>{" "}
              an editor for the "${documentType}" document type
            </p>
          </div>
        }
      />
    );
  }

  const EditorComponent = editorModule.Component;

  return (
    <div className="relative h-full" id="document-editor-context">
      {revisionHistoryVisible ? (
        <RevisionHistory
          key={documentId}
          documentTitle={documentName ?? ""}
          documentId={documentId ?? ""}
          globalOperations={globalOperations}
          localOperations={localOperations}
          onClose={() => setRevisionHistoryVisible(false)}
          documentState={document.state}
          onCopyState={() => {
            toast("Copied document state to clipboard", { type: "success" });
          }}
        />
      ) : (
        <Suspense fallback={<EditorLoader />} name="EditorLoader">
          <ErrorBoundary
            fallbackRender={FallbackEditorError}
            key={documentId}
            onError={handleEditorError}
          >
            {!editorError?.error && (
              <EditorComponent
                key={documentId}
                context={{
                  readMode: !!selectedTimelineItem,
                  selectedTimelineRevision: getRevisionFromDate(
                    selectedTimelineItem?.startDate,
                    selectedTimelineItem?.endDate,
                    globalOperations,
                  ),
                }}
                documentId={document.header.id}
              />
            )}
          </ErrorBoundary>
        </Suspense>
      )}
    </div>
  );
};
