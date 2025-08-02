import {
    useConnectCrypto,
    useConnectDid,
    useUndoRedoShortcuts,
    useUserPermissions,
} from '#hooks';
import { themeAtom, useUser } from '#store';
import {
    addActionContext,
    type DocumentDispatchCallback,
    signOperation,
    useDocumentDispatch,
} from '#utils';
import { getRevisionFromDate, useTimelineItems } from '@powerhousedao/common';
import {
    Button,
    DocumentToolbar,
    RevisionHistory,
    type TimelineItem,
} from '@powerhousedao/design-system';
import {
    useDocumentModelModuleById,
    useEditorModuleById,
} from '@powerhousedao/state';
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
import { useAtomValue } from 'jotai';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { useNavigate } from 'react-router-dom';
import { EditorLoader } from './editor-loader.js';
import { useModal } from './modal/index.js';

type Props<TDocument extends PHDocument = PHDocument> = {
    document: TDocument;
    onClose: () => void;
    onExport: () => void;
    onAddOperation: (operation: Operation) => Promise<void>;
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
        document,
        onClose,
        onExport,
        onAddOperation,
        onOpenSwitchboardLink,
    } = props;
    const documentId = document.header.id;
    const [selectedTimelineItem, setSelectedTimelineItem] =
        useState<TimelineItem | null>(null);
    const [revisionHistoryVisible, setRevisionHistoryVisible] = useState(false);
    const theme = useAtomValue(themeAtom);
    const user = useUser() || undefined;
    const connectDid = useConnectDid();
    const { sign } = useConnectCrypto();
    const documentType = document.header.documentType;
    const documentModel = useDocumentModelModuleById(documentType);
    const editor = useEditorModuleById(document.header.meta?.preferredEditor);

    const [, _dispatch, error] = useDocumentDispatch(
        documentModel?.reducer,
        document,
    );
    const context: EditorContext = useMemo(
        () => ({ theme, user }),
        [theme, user],
    );
    const userPermissions = useUserPermissions();

    const timelineItems = useTimelineItems(
        documentId,
        document.header.createdAtUtcIso,
    );

    const dispatch = useCallback(
        (action: Action, onErrorCallback?: ActionErrorCallback) => {
            const callback: DocumentDispatchCallback<PHDocument> = (
                operation,
                state,
            ) => {
                if (!documentId) return;

                const { prevState } = state;

                signOperation(
                    operation,
                    sign,
                    documentId,
                    prevState,
                    documentModel?.reducer,
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
            documentModel?.reducer,
            onAddOperation,
            documentId,
            sign,
            user,
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

    const isLoadingEditor =
        editor === undefined ||
        (editor &&
            !editor.documentTypes.includes(document.header.documentType) &&
            !editor.documentTypes.includes('*'));

    const canUndo =
        document.header.revision.global > 0 ||
        document.header.revision.local > 0;
    const canRedo = !!document?.clipboard.length;
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

    if (isLoadingEditor) {
        return <EditorLoader message="Loading editor" />;
    }

    if (!documentModel) {
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

    if (!editor) {
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

    const EditorComponent = editor.Component;
    const {
        disableExternalControls,
        documentToolbarEnabled,
        showSwitchboardLink,
        timelineEnabled,
    } = editor.config;

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
                        title={document.header.name}
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
                    key={documentId}
                    documentTitle={document.header.name}
                    documentId={document.header.id}
                    globalOperations={document.operations.global}
                    localOperations={document.operations.local}
                    onClose={hideRevisionHistory}
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
                                error={error}
                                context={{
                                    ...context,
                                    readMode: !!selectedTimelineItem,
                                    selectedTimelineRevision:
                                        getRevisionFromDate(
                                            selectedTimelineItem?.startDate,
                                            selectedTimelineItem?.endDate,
                                            document.operations.global,
                                        ),
                                }}
                                document={document}
                                documentNodeName={document.header.name}
                                dispatch={dispatch}
                                onClose={onClose}
                                onExport={onExport}
                                canUndo={canUndo}
                                canRedo={canRedo}
                                undo={handleUndo}
                                redo={handleRedo}
                                onSwitchboardLinkClick={
                                    handleSwitchboardLinkClick
                                }
                                onShowRevisionHistory={showRevisionHistory}
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
