import { EditorLoader } from "./editor-loader.js";
import { useUndoRedoShortcuts } from "@powerhousedao/connect/hooks";
import { dismissToast, toast } from "@powerhousedao/connect/services";
import { Icon, PowerhouseButton } from "@powerhousedao/design-system";
import { useBaseReducer3UndoRedo } from "@powerhousedao/design-system/connect";
import {
  EditorDocumentProvider,
  getRevisionFromDate,
  openTarget,
  useDocumentById,
  useDocumentModelModuleById,
  useDocumentOperations,
  useDocumentVersionStatus,
  useEditorModuleFor,
  useRevisionHistoryVisible,
  useSelectedTimelineItem,
  useVetraPackageManager,
  useVetraPackages,
} from "@powerhousedao/reactor-browser";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { redo, undo } from "@powerhousedao/shared/document-model";
import { createElement, Suspense, useEffect, useState } from "react";
import {
  CenteredErrorMessage,
  ErrorBoundary,
} from "@powerhousedao/connect/components/shared";
import { DocumentUpgradeToast } from "./document-upgrade-toast.js";
import { GenericRevisionHistory } from "./revision-history-view.js";

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
          <h3 className="min-w-0 text-lg font-semibold wrap-break-word text-foreground">
            {title}
          </h3>
        </div>
        <div className="wrap-break-word">{children}</div>
      </div>
    </div>
  );
}

function OpenPackageManagerButton() {
  return (
    <PowerhouseButton
      className="px-3 py-1.5 text-base font-medium"
      onClick={() => {
        openTarget({ settings: "package-manager" });
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
  const documentType = document?.header.documentType ?? undefined;
  // The timeline read-mode feature maps a selected date range to a global
  // revision, which needs the whole global history. Fetched only while a
  // timeline item is selected; shares the cache entry with the panel when
  // the panel is on "global".
  const {
    operations: globalOperations,
    hasNextPage: globalHasNextPage,
    isLoading: isLoadingGlobal,
    fetchNextPage: fetchNextGlobalPage,
    error: globalError,
  } = useDocumentOperations(documentId, "global", {
    enabled: !!selectedTimelineItem,
    // A page fetch costs the same for 100 or 500 rows in the in-browser
    // reactor, so fewer, bigger round trips are strictly cheaper.
    limit: 500,
  });
  useEffect(() => {
    // An error ends the walk; we answer from what loaded rather than
    // retrying forever.
    if (!globalHasNextPage || isLoadingGlobal || globalError) return;
    // Deferred: the cache's fetch and the render it triggers are both
    // synchronous, so calling fetchNextGlobalPage here directly would chain
    // fetch -> render -> effect -> fetch into one uninterrupted task;
    // setTimeout(0) yields between pages so the UI stays responsive.
    const handle = window.setTimeout(fetchNextGlobalPage, 0);
    return () => window.clearTimeout(handle);
  }, [globalHasNextPage, isLoadingGlobal, fetchNextGlobalPage, globalError]);

  const globalRevisionNumber = document?.header.revision.global ?? 0;
  const localRevisionNumber = document?.header.revision.local ?? 0;
  const documentModelModule = useDocumentModelModuleById(documentType);
  const editorModule = useEditorModuleFor(document);
  const versionStatus = useDocumentVersionStatus(document ?? undefined);
  const versionStatusKind = versionStatus?.kind;
  const upgradeAvailable =
    versionStatus?.kind === "upgrade-available" && versionStatus.canUpgrade;
  useEffect(() => {
    if (upgradeAvailable && documentId) {
      toast(createElement(DocumentUpgradeToast, { documentId }), {
        type: "connect-warning",
        toastId: `outdated-document-${documentId}`,
        autoClose: false,
      });
    } else if (
      versionStatusKind &&
      versionStatusKind !== "upgrade-available" &&
      documentId
    ) {
      dismissToast(`outdated-document-${documentId}`);
    }
  }, [upgradeAvailable, versionStatusKind, documentId]);
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

  // Base-reducer 3 undoes through the client, so the author signs the
  // RETRACT and presses run in order; without a client the controls are
  // disabled. Undefined below base-reducer 3, which dispatches UNDO and REDO.
  const clientUndoRedo = useBaseReducer3UndoRedo(document);
  const canUndo =
    clientUndoRedo?.canUndo ??
    (globalRevisionNumber > 0 || localRevisionNumber > 0);
  const canRedo = clientUndoRedo?.canRedo ?? !!document?.clipboard.length;
  const addUndoAction = clientUndoRedo?.undo ?? (() => dispatch(undo()));
  const addRedoAction = clientUndoRedo?.redo ?? (() => dispatch(redo()));
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
      // eslint-disable-next-line react-hooks-extra/set-state-in-effect
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

  if (versionStatus?.kind === "unsupported") {
    return (
      <EditorError title="Document version not supported">
        <p className="mb-4 text-sm text-foreground">
          This document requires version {versionStatus.documentVersion} of the
          "{documentType}" document model, but only version
          {versionStatus.availableVersions.length > 1 ? "s" : ""}{" "}
          {versionStatus.availableVersions.join(", ")}{" "}
          {versionStatus.availableVersions.length > 1 ? "are" : "is"} installed.
          Update the package that provides "{documentType}" to open it.
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
        <GenericRevisionHistory key={documentId} document={document} />
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
              <EditorDocumentProvider document={document} dispatch={dispatch}>
                <EditorComponent
                  key={`${editorBundleKey}:${documentId}`}
                  context={{
                    readMode: !!selectedTimelineItem,
                    // Until the whole global history has paged in, the date lookup
                    // cannot be answered; undefined leaves the editor on the latest
                    // state in read mode instead of jumping to revision 0. A failed
                    // page ends the walk, so we answer from what loaded rather than
                    // waiting on a page that will never arrive.
                    selectedTimelineRevision:
                      (isLoadingGlobal || globalHasNextPage) && !globalError
                        ? undefined
                        : getRevisionFromDate(
                            selectedTimelineItem?.startDate,
                            selectedTimelineItem?.endDate,
                            globalOperations,
                          ),
                  }}
                  documentId={document.header.id}
                  document={document}
                  dispatch={dispatch}
                />
              </EditorDocumentProvider>
            )}
          </ErrorBoundary>
        </Suspense>
      )}
    </div>
  );
};
