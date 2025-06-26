import {
    useConnectCrypto,
    useConnectDid,
    useUndoRedoShortcuts,
    useUserPermissions,
} from '#hooks';
import { useUser } from '#store';
import {
    addActionContext,
    type DocumentDispatchCallback,
    signOperation,
    useDocumentDispatch,
} from '#utils';
import {
    getRevisionFromDate,
    unwrapLoadable,
    useDocumentModelModule,
    useEditorByDocumentType,
    useModal,
    useSelectedDocument,
    useTheme,
    useTimelineItems,
} from '@powerhousedao/common';
import {
    Button,
    DocumentToolbar,
    RevisionHistory,
    type TimelineItem,
} from '@powerhousedao/design-system';
import { logger } from 'document-drive';
import {
    type Action,
    type ActionErrorCallback,
    type EditorContext,
    type Operation,
    type PHDocument,
    redo,
    undo,
} from 'document-model';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { EditorLoader } from './editor-loader.js';

export type EditorProps<TDocument extends PHDocument = PHDocument> = {
    onClose: () => void;
    onExport: () => void;
    onAddOperation: (operation: Operation) => Promise<void>;
    onOpenSwitchboardLink?: () => Promise<void>;
    onChange?: (documentId: string, document: TDocument) => void;
    onGetDocumentRevision?: EditorContext['getDocumentRevision'];
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

export const DocumentEditor: React.FC<EditorProps> = props => {
    const {
        onClose,
        onExport,
        onAddOperation,
        onGetDocumentRevision,
        onOpenSwitchboardLink,
    } = props;
    const [selectedTimelineItem, setSelectedTimelineItem] =
        useState<TimelineItem | null>(null);
    const [revisionHistoryVisible, setRevisionHistoryVisible] = useState(false);
    const theme = useTheme();
    const user = useUser() || undefined;
    const connectDid = useConnectDid();
    const { sign } = useConnectCrypto();
    const loadableSelectedDocument = useSelectedDocument();
    const unwrappedDocument = unwrapLoadable(loadableSelectedDocument);
    const documentId = unwrappedDocument?.id;
    const documentType = unwrappedDocument?.documentType;
    const revision = unwrappedDocument?.revision;
    const clipboard = unwrappedDocument?.clipboard;
    const loadableDocumentModelModule = useDocumentModelModule(documentType);
    const unwrappedDocumentModelModule = unwrapLoadable(
        loadableDocumentModelModule,
    );
    const reducer = unwrappedDocumentModelModule?.reducer;
    const loadableEditorModule = useEditorByDocumentType(documentType);

    const [document, _dispatch, error] = useDocumentDispatch(
        reducer,
        unwrappedDocument,
    );
    const context: EditorContext = useMemo(
        () => ({ theme, user }),
        [theme, user],
    );
    const userPermissions = useUserPermissions();

    const timelineItems = useTimelineItems(
        unwrappedDocument?.id,
        unwrappedDocument?.created,
    );

    const dispatch = useCallback(
        (action: Action, onErrorCallback?: ActionErrorCallback) => {
            const callback: DocumentDispatchCallback<PHDocument> = (
                operation,
                state,
            ) => {
                if (!documentId) {
                    return;
                }
                const { prevState } = state;

                signOperation(
                    operation,
                    sign,
                    documentId,
                    prevState,
                    reducer,
                    user,
                )
                    .then(op => {
                        window.documentEditorDebugTools?.pushOperation(
                            operation,
                        );
                        return onAddOperation(op);
                    })
                    .catch(logger.error);
            };

            _dispatch(
                addActionContext(action, connectDid, user),
                callback,
                onErrorCallback,
            );
        },
        [
            _dispatch,
            connectDid,
            reducer,
            onAddOperation,
            sign,
            user,
            documentId,
        ],
    );

    const showRevisionHistory = useCallback(
        () => setRevisionHistoryVisible(true),
        [],
    );

    const hideRevisionHistory = useCallback(
        () => setRevisionHistoryVisible(false),
        [],
    );
    const handleUndo = useCallback(() => {
        dispatch(undo());
    }, [dispatch]);

    const handleRedo = useCallback(() => {
        dispatch(redo());
    }, [dispatch]);

    const canUndo = !!revision && (revision.global > 0 || revision.local > 0);
    const canRedo = !!clipboard?.length;
    useUndoRedoShortcuts({
        undo: handleUndo,
        redo: handleRedo,
        canUndo,
        canRedo,
    });

    useEffect(() => {
        return () => {
            window.documentEditorDebugTools?.clear();
        };
    }, []);

    const { show: showSettingsModal } = useModal('settings');

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

    const handleEditorError = useCallback(
        (error: Error, info: React.ErrorInfo) => {
            setEditorError({
                error,
                documentId,
                info,
            });
        },
        [documentId],
    );

    if (loadableSelectedDocument.state === 'loading') {
        return <EditorLoader message={'Loading document'} />;
    }

    if (loadableDocumentModelModule.state === 'loading') {
        return <EditorLoader message={'Loading document model'} />;
    }

    if (loadableEditorModule.state === 'loading') {
        return <EditorLoader message={'Loading editor'} />;
    }

    if (loadableSelectedDocument.state === 'hasError') {
        console.error(loadableSelectedDocument.error);
        return <EditorError message={'Error loading document'} />;
    }

    if (loadableDocumentModelModule.state === 'hasError') {
        console.error(loadableDocumentModelModule.error);
        return <EditorError message={'Error loading document model'} />;
    }

    if (loadableEditorModule.state === 'hasError') {
        console.error(loadableEditorModule.error);
        return <EditorError message={'Error loading editor'} />;
    }

    if (editorError?.error) {
        console.error(editorError.error);
        return <EditorError message={'Error in editor'} />;
    }

    if (!loadableDocumentModelModule.data) {
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
                                    showSettingsModal();
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

    if (!loadableEditorModule.data) {
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
                                    showSettingsModal();
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

    if (!loadableSelectedDocument.data) {
        return <EditorError message={'Document not found'} />;
    }

    const EditorComponent = loadableEditorModule.data.Component;
    const {
        disableExternalControls,
        documentToolbarEnabled,
        showSwitchboardLink,
        timelineEnabled,
    } = loadableEditorModule.data.config;

    if (!document) {
        return <EditorError message={'Document not found'} />;
    }

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
                        onShowRevisionHistory={showRevisionHistory}
                        title={document.name}
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
                        <Button onClick={handleUndo} disabled={!canUndo}>
                            Undo
                        </Button>
                        <Button onClick={handleRedo} disabled={!canRedo}>
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
                    key={document.id}
                    documentTitle={document.name}
                    documentId={document.id}
                    globalOperations={document.operations.global}
                    localOperations={document.operations.local}
                    onClose={hideRevisionHistory}
                />
            ) : (
                <ErrorBoundary
                    fallbackRender={FallbackEditorError}
                    key={document.id}
                    onError={handleEditorError}
                >
                    <EditorComponent
                        key={document.id}
                        error={error}
                        context={{
                            ...context,
                            getDocumentRevision: onGetDocumentRevision,
                            readMode: !!selectedTimelineItem,
                            selectedTimelineRevision: getRevisionFromDate(
                                selectedTimelineItem?.startDate,
                                selectedTimelineItem?.endDate,
                                document.operations.global,
                            ),
                        }}
                        document={document}
                        documentNodeName={document.name}
                        dispatch={dispatch}
                        onClose={onClose}
                        onExport={onExport}
                        canUndo={canUndo}
                        canRedo={canRedo}
                        undo={handleUndo}
                        redo={handleRedo}
                        onSwitchboardLinkClick={handleSwitchboardLinkClick}
                        onShowRevisionHistory={showRevisionHistory}
                        isAllowedToCreateDocuments={
                            userPermissions?.isAllowedToCreateDocuments ?? false
                        }
                        isAllowedToEditDocuments={
                            userPermissions?.isAllowedToEditDocuments ?? false
                        }
                    />
                </ErrorBoundary>
            )}
        </div>
    );
};
