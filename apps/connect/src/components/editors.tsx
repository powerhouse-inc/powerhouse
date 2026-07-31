import { EditorLoader } from "@powerhousedao/connect/components";
import { useUndoRedoShortcuts } from "@powerhousedao/connect/hooks";
import { toast } from "@powerhousedao/connect/services";
import { Icon, PowerhouseButton } from "@powerhousedao/design-system";
import { RevisionHistory } from "@powerhousedao/design-system/connect";
import {
  getRevisionFromDate,
  setRevisionHistoryVisible,
  showPHModal,
  useDocumentById,
  useDocumentModelModuleById,
  useDocumentOperations,
  useEditorModuleById,
  useFallbackEditorModule,
  useRevisionHistoryVisible,
  useSelectedTimelineItem,
  useVetraPackageManager,
  useVetraPackages,
} from "@powerhousedao/reactor-browser";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { redo, undo } from "@powerhousedao/shared/document-model";
import { Suspense, useEffect, useState } from "react";
import { CenteredErrorMessage, ErrorBoundary } from "./error-boundary.js";

type Props<TDocument extends PHDocument = PHDocument> = {
  document: TDocument;
};

// Card treatment mirrors DetailedFallback in error-boundary.tsx so editor
// errors read the same as boundary errors, and stay legible in both themes
// (bg-card/border-border/text-foreground tokens instead of bare text).
function EditorError({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex size-full items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 text-foreground shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Icon name="Error" className="size-5 shrink-0 text-destructive" />
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        </div>
        {children}
      </div>
    </div>
  );
}

function OpenPackageManagerButton() {
  return (
    <PowerhouseButton
      className="px-3 py-1.5 text-base font-medium"
      onClick={() => {
        showPHModal({ type: "settings" });
      }}
      type="button"
    >
      Open package manager
    </PowerhouseButton>
  );
}

export const DocumentEditor: React.FC<Props> = (props) => {
  const { document: initialDocument } = props;
  const selectedTimelineItem = useSelectedTimelineItem();
  const revisionHistoryVisible = useRevisionHistoryVisible();
  const [document, dispatch] = useDocumentById(initialDocument.header.id);
  const documentId = document?.header.id ?? undefined;
  const documentName = document?.header.name ?? undefined;
  const documentType = document?.header.documentType ?? undefined;
  const preferredEditor = document?.header.meta?.preferredEditor ?? undefined;
  const {
    globalOperations,
    localOperations,
    isLoading: isLoadingOperations,
    refetch: refetchOperations,
  } = useDocumentOperations(documentId);

  // Refetch operations when revision history panel opens
  useEffect(() => {
    if (revisionHistoryVisible) {
      void refetchOperations();
    }
  }, [revisionHistoryVisible, refetchOperations]);

  const globalRevisionNumber = document?.header.revision.global ?? 0;
  const localRevisionNumber = document?.header.revision.local ?? 0;
  const documentModelModule = useDocumentModelModuleById(documentType);
  const preferredEditorModule = useEditorModuleById(preferredEditor);
  const fallbackEditorModule = useFallbackEditorModule(documentType);
  const editorModule = preferredEditorModule ?? fallbackEditorModule;
  const vetraPackages = useVetraPackages();
  const packageManager = useVetraPackageManager();
  const owningPackageName = editorModule
    ? vetraPackages.find((pkg) => pkg.editors.includes(editorModule))?.manifest
        .name
    : undefined;
  const owningPackageVersion =
    owningPackageName && packageManager
      ? packageManager.getPackageVersion(owningPackageName)
      : undefined;
  const editorBundleKey = owningPackageName
    ? `${owningPackageName}@${owningPackageVersion ?? "unknown"}`
    : (editorModule?.config.id ?? "no-editor");
  const isLoadingDocument = !document;
  const isLoadingEditor =
    editorModule &&
    documentType &&
    !editorModule.documentTypes.includes(documentType) &&
    !editorModule.documentTypes.includes("*");

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      <EditorError title="Document type not supported">
        <p className="mb-4 text-sm text-foreground">
          This document can't be opened because the "{documentType}" document
          model isn't installed. Install the package that provides it to open
          the document.
        </p>
        <OpenPackageManagerButton />
      </EditorError>
    );
  }

  if (!editorModule) {
    return (
      <EditorError title="No editor available">
        <p className="mb-4 text-sm text-foreground">
          The "{documentType}" document model is installed, but no editor for it
          was found. Install a package that provides an editor for this document
          type.
        </p>
        <OpenPackageManagerButton />
      </EditorError>
    );
  }
  const EditorComponent = editorModule.Component;

  return (
    <div
      className="relative h-full"
      id="document-editor-context"
      data-editor={editorModule.config.id}
      data-document-type={documentType}
    >
      {revisionHistoryVisible ? (
        isLoadingOperations ? (
          <EditorLoader message="Loading operations" />
        ) : (
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
            onCopyDocId={() => {
              toast("Copied document ID to clipboard", { type: "success" });
            }}
          />
        )
      ) : (
        <Suspense
          fallback={<EditorLoader message="Loading editor" />}
          name="EditorLoader"
        >
          <ErrorBoundary
            fallbackRender={CenteredErrorMessage}
            resetKeys={[documentId]}
            onError={handleEditorError}
            loggerContext={["Connect", "DocumentEditor"]}
          >
            {!editorError?.error && (
              <EditorComponent
                key={`${editorBundleKey}:${documentId}`}
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
