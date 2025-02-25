import { useConnectCrypto, useConnectDid } from '#hooks/useConnectCrypto';
import { useUndoRedoShortcuts } from '#hooks/useUndoRedoShortcuts';
import { useUserPermissions } from '#hooks/useUserPermissions';
import { logger } from '#services/logger';
import { FileNodeDocument, isSameDocument } from '#store/document-drive';
import { useGetDocumentModelModule } from '#store/document-model';
import { useGetEditor } from '#store/editor';
import { themeAtom } from '#store/theme';
import { useUser } from '#store/user';
import {
    DocumentDispatchCallback,
    useDocumentDispatch,
} from '#utils/document-model';
import { addActionContext, signOperation } from '#utils/signature';
import { DocumentToolbar, RevisionHistory } from '@powerhousedao/design-system';
import { logger } from 'document-drive/logger';
import {
    Action,
    ActionErrorCallback,
    EditorContext,
    Operation,
    PHDocument,
    redo,
    undo,
} from 'document-model';
import { useAtomValue } from 'jotai';
import React, {
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { ErrorBoundary, FallbackProps } from 'react-error-boundary';
import { useNavigate } from 'react-router-dom';
import { useConnectCrypto, useConnectDid } from 'src/hooks/useConnectCrypto';
import { useUndoRedoShortcuts } from 'src/hooks/useUndoRedoShortcuts';
import { useUserPermissions } from 'src/hooks/useUserPermissions';
import { FileNodeDocument, isSameDocument } from 'src/store/document-drive';
import { useGetDocumentModel } from 'src/store/document-model';
import { useGetEditor } from 'src/store/editor';
import { themeAtom } from 'src/store/theme';
import { useUser } from 'src/store/user';
import {
    DocumentDispatchCallback,
    useDocumentDispatch,
} from 'src/utils/document-model';
import { addActionContext, signOperation } from 'src/utils/signature';
import Button from './button';
import { EditorLoader } from './editor-loader';
import { useModal } from './modal';

export type EditorProps<TGlobalState = unknown, TLocalState = unknown> = {
    fileNodeDocument: FileNodeDocument;
    document: PHDocument<TGlobalState, TLocalState> | undefined;
    onClose: () => void;
    onExport: () => void;
    onAddOperation: (operation: Operation) => Promise<void>;
    onOpenSwitchboardLink?: () => Promise<void>;
    onChange?: (
        documentId: string,
        document: PHDocument<TGlobalState, TLocalState>,
    ) => void;
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
        fileNodeDocument,
        document: initialDocument,
        onClose,
        onChange,
        onExport,
        onAddOperation,
        onOpenSwitchboardLink,
    } = props;
    const documentId = fileNodeDocument?.documentId;
    const [revisionHistoryVisible, setRevisionHistoryVisible] = useState(false);
    const theme = useAtomValue(themeAtom);
    const user = useUser() || undefined;
    const connectDid = useConnectDid();
    const { sign } = useConnectCrypto();
    const getDocumentModelModule = useGetDocumentModelModule();
    const getEditor = useGetEditor();

    const documentType = fileNodeDocument?.documentType;
    const documentModel = useMemo(
        () => (documentType ? getDocumentModelModule(documentType) : undefined),
        [documentType, getDocumentModelModule],
    );

    const editor = useMemo(
        () => (documentType ? getEditor(documentType) : undefined),
        [documentType, getEditor],
    );

    const [document, _dispatch, error] = useDocumentDispatch(
        documentModel?.reducer,
        initialDocument,
    );
    const context: EditorContext = useMemo(
        () => ({ theme, user }),
        [theme, user],
    );
    const userPermissions = useUserPermissions();

    const currentDocument = useRef({ ...fileNodeDocument, document });
    useEffect(() => {
        if (!fileNodeDocument?.documentId || !document) return;

        // if current document ref is undefined or outdated then updates the ref
        // and doesn't call the onChange callback
        if (
            !('documentId' in currentDocument.current) ||
            currentDocument.current.documentId !== documentId
        ) {
            currentDocument.current = { ...fileNodeDocument, document };
            return;
        }

        // if the document is different then calls the onChange callback
        if (!isSameDocument(currentDocument.current.document, document)) {
            currentDocument.current.document = document;
            window.documentEditorDebugTools?.setDocument(document);
            onChange?.(documentId, document);
        }
    }, [document, documentId, fileNodeDocument, onChange]);

    const dispatch = useCallback(
        (action: Action, onErrorCallback?: ActionErrorCallback) => {
            const callback: DocumentDispatchCallback<unknown, unknown> = (
                operation,
                state,
            ) => {
                if (!fileNodeDocument?.documentId) return;

                const { prevState } = state;

                signOperation(
                    operation,
                    sign,
                    fileNodeDocument.documentId,
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
            fileNodeDocument,
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

    const isLoadingDocument =
        fileNodeDocument?.status === 'LOADING' || !document;
    const isLoadingEditor =
        editor === undefined ||
        (!!document &&
            editor &&
            !editor.documentTypes.includes(document.documentType) &&
            !editor.documentTypes.includes('*'));

    const canUndo =
        !!document &&
        (document.revision.global > 0 || document.revision.local > 0);
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
        if (
            editorError &&
            editorError.documentId !== fileNodeDocument?.documentId
        ) {
            setEditorError(undefined);
        }
    }, [editorError, fileNodeDocument, document]);

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

    if (fileNodeDocument?.status === 'ERROR') {
        return <EditorError message={'Error loading document'} />;
    }

    if (isLoadingDocument || isLoadingEditor) {
        const message = isLoadingDocument
            ? 'Loading document'
            : 'Loading editor';
        return <EditorLoader message={message} />;
    }

    if (!fileNodeDocument) {
        return null;
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

    if (editor === null) {
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
    } = editor.config || {};

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
                        title={fileNodeDocument.name || document.name}
                        onSwitchboardLinkClick={handleSwitchboardLinkClick}
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
                    documentTitle={document.name}
                    documentId={fileNodeDocument.documentId}
                    globalOperations={document.operations.global}
                    localOperations={document.operations.local}
                    onClose={hideRevisionHistory}
                />
            ) : (
                <Suspense fallback={<EditorLoader />}>
                    <ErrorBoundary
                        fallbackRender={FallbackEditorError}
                        key={documentId}
                        onError={handleEditorError}
                    >
                        {!editorError?.error && (
                            <EditorComponent
                                key={documentId}
                                error={error}
                                context={context}
                                document={document}
                                documentNodeName={fileNodeDocument.name}
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
