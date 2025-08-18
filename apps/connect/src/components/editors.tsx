import { useUndoRedoShortcuts } from '#hooks';
import { getRevisionFromDate, useTimelineItems } from '@powerhousedao/common';
import {
    Button,
    DocumentToolbar,
    RevisionHistory,
    type TimelineItem,
} from '@powerhousedao/design-system';
import {
    useDispatch,
    useDocumentModelModuleById,
    useEditorModuleById,
    useFallbackEditorModule,
    useUserPermissions,
} from '@powerhousedao/reactor-browser';
import { type PHDocument, redo, undo } from 'document-model';
import { Suspense, useEffect, useState } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { useNavigate } from 'react-router-dom';
import { EditorLoader } from './editor-loader.js';
import { useModal } from './modal/index.js';

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

export const DocumentEditor: React.FC<Props> = props => {
    const {
        document: initialDocument,
        onClose,
        onExport,
        onOpenSwitchboardLink,
    } = props;
    const [selectedTimelineItem, setSelectedTimelineItem] =
        useState<TimelineItem | null>(null);
    const [revisionHistoryVisible, setRevisionHistoryVisible] = useState(false);
    const [document, dispatch] = useDispatch(initialDocument);
    const documentId = document?.header.id ?? undefined;
    const documentName = document?.header.name ?? undefined;
    const documentType = document?.header.documentType ?? undefined;
    const preferredEditor = document?.header.meta?.preferredEditor ?? undefined;
    const createdAt = document?.header.createdAtUtcIso ?? undefined;
    const globalOperations = document?.operations.global ?? [];
    const localOperations = document?.operations.local ?? [];
    const globalRevisionNumber = document?.header.revision.global ?? 0;
    const localRevisionNumber = document?.header.revision.local ?? 0;
    const documentModelModule = useDocumentModelModuleById(documentType);
    const preferredEditorModule = useEditorModuleById(preferredEditor);
    const fallbackEditorModule = useFallbackEditorModule(documentType);
    const editorModule = preferredEditorModule ?? fallbackEditorModule;

    const userPermissions = useUserPermissions();

    const timelineItems = useTimelineItems(documentId, createdAt);

    const isLoadingEditor =
        editorModule === undefined ||
        (editorModule &&
            documentType &&
            !editorModule.documentTypes.includes(documentType) &&
            !editorModule.documentTypes.includes('*'));

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

    const navigate = useNavigate();
    const { showModal } = useModal();

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

    if (!documentModelModule) {
        return (
            <EditorError
                message={
                    <div className="text-center leading-10">
                        <p>
                            Unable to open the document because the document
                            model "{documentType}" is not supported.
                        </p>
                        <p>
                            Go to the{' '}
                            <button
                                type="button"
                                className="cursor-pointer underline"
                                onClick={() => {
                                    showModal('settingsModal', {
                                        onRefresh: () => navigate(0),
                                    });
                                }}
                            >
                                package manager
                            </button>{' '}
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
                        <p>
                            Unable to open the document because no editor has
                            been found
                        </p>
                        <p>
                            Go to the{' '}
                            <button
                                type="button"
                                className="cursor-pointer underline"
                                onClick={() => {
                                    showModal('settingsModal', {
                                        onRefresh: () => navigate(0),
                                    });
                                }}
                            >
                                package manager
                            </button>{' '}
                            an editor for the "${documentType}" document type
                        </p>
                    </div>
                }
            />
        );
    }

    const EditorComponent = editorModule.Component;
    const {
        disableExternalControls,
        documentToolbarEnabled,
        showSwitchboardLink,
        timelineEnabled,
    } = editorModule.config;

    const handleSwitchboardLinkClick =
        showSwitchboardLink !== false ? onOpenSwitchboardLink : undefined;
    return (
        <div className="relative h-full" id="document-editor-context">
            {documentToolbarEnabled &&
                disableExternalControls &&
                !revisionHistoryVisible && (
                    <DocumentToolbar
                        onClose={onClose}
                        onExport={onExport}
                        onShowRevisionHistory={() =>
                            setRevisionHistoryVisible(true)
                        }
                        title={documentName}
                        onSwitchboardLinkClick={handleSwitchboardLinkClick}
                        timelineButtonVisible={timelineEnabled}
                        timelineItems={timelineItems.data}
                        onTimelineItemClick={setSelectedTimelineItem}
                    />
                )}
            {!disableExternalControls && (
                <div className="mb-4 flex justify-end gap-10">
                    <Button onClick={onExport}>Export</Button>
                    <div className="flex gap-4">
                        <Button onClick={addUndoAction} disabled={!canUndo}>
                            Undo
                        </Button>
                        <Button onClick={addRedoAction} disabled={!canRedo}>
                            Redo
                        </Button>
                    </div>
                    <div className="flex gap-4">
                        <Button onClick={onClose}>Close</Button>
                    </div>
                </div>
            )}
            {revisionHistoryVisible ? (
                <RevisionHistory
                    key={documentId}
                    documentTitle={documentName ?? ''}
                    documentId={documentId ?? ''}
                    globalOperations={globalOperations}
                    localOperations={localOperations}
                    onClose={() => setRevisionHistoryVisible(false)}
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
                                    selectedTimelineRevision:
                                        getRevisionFromDate(
                                            selectedTimelineItem?.startDate,
                                            selectedTimelineItem?.endDate,
                                            globalOperations,
                                        ),
                                }}
                                document={document}
                                documentNodeName={documentName ?? ''}
                                onClose={onClose}
                                onExport={onExport}
                                canUndo={canUndo}
                                canRedo={canRedo}
                                onSwitchboardLinkClick={
                                    handleSwitchboardLinkClick
                                }
                                onShowRevisionHistory={() =>
                                    setRevisionHistoryVisible(true)
                                }
                                isAllowedToCreateDocuments={
                                    userPermissions?.isAllowedToCreateDocuments ??
                                    false
                                }
                                isAllowedToEditDocuments={
                                    userPermissions?.isAllowedToEditDocuments ??
                                    false
                                }
                            />
                        )}
                    </ErrorBoundary>
                </Suspense>
            )}
        </div>
    );
};
