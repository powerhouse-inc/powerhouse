import { useUser } from '#store';
import {
    addActionContext,
    type DocumentDispatch,
    type DocumentDispatchCallback,
    exportFile,
    signOperation,
    validateDocument,
} from '#utils';
import {
    useGetDocumentModelModule,
    useModal,
    useParentFolder,
    useSetSelectedNode,
    useTheme,
    useUnwrappedSelectedDocument,
    useUnwrappedSelectedDrive,
} from '@powerhousedao/common';
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
import { useCallback, useMemo, useState } from 'react';
import { useConnectCrypto, useConnectDid } from './useConnectCrypto.js';
import { useUserPermissions } from './useUserPermissions.js';

export interface EditorProps {
    context: EditorContext;
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
    onClose: () => void;
    onExport: () => void;
    onShowRevisionHistory: () => void;
    isAllowedToCreateDocuments: boolean;
    isAllowedToEditDocuments: boolean;
}

export function useEditorDispatch(
    documentDispatch: DocumentDispatch<PHDocument>,
    onAddOperation: (operation: Operation) => Promise<void>,
) {
    const user = useUser() || undefined;
    const connectDid = useConnectDid();
    const selectedDrive = useUnwrappedSelectedDrive();
    const selectedDocument = useUnwrappedSelectedDocument();
    const documentId = selectedDocument?.id ?? selectedDrive?.id;
    const documentType = selectedDocument?.documentType;
    const { sign } = useConnectCrypto();
    const getDocumentModelModule = useGetDocumentModelModule();
    const documentModelModule = useMemo(
        () => (documentType ? getDocumentModelModule(documentType) : undefined),
        [documentType, getDocumentModelModule],
    );

    const documentDispatchCallback: DocumentDispatchCallback<PHDocument> =
        useCallback(
            (operation, state) => {
                console.log(
                    'useEditorDispatch callback',
                    operation,
                    documentId,
                );
                if (!documentId) return;

                const { prevState } = state;

                signOperation(
                    operation,
                    sign,
                    documentId,
                    prevState,
                    documentModelModule?.reducer,
                    user,
                )
                    .then(op => {
                        window.documentEditorDebugTools?.pushOperation(
                            operation,
                        );
                        return onAddOperation(op);
                    })
                    .catch(logger.error);
            },
            [documentId, documentModelModule?.reducer, sign, user],
        );

    const dispatch = useCallback(
        (action: Action, onErrorCallback?: ActionErrorCallback) => {
            console.log('useEditorDispatch', action);

            documentDispatch(
                addActionContext(action, connectDid, user),
                documentDispatchCallback,
                onErrorCallback,
            );
        },
        [documentDispatch, connectDid, documentDispatchCallback, user],
    );

    return dispatch;
}

export function useEditorProps(
    documentDispatch: DocumentDispatch<PHDocument>,
    onAddOperation: (operation: Operation) => Promise<void>,
) {
    const { show: showExportWithErrorsModal } = useModal('exportWithErrors');
    const selectedDocument = useUnwrappedSelectedDocument();
    const parentFolder = useParentFolder(selectedDocument?.id);
    const setSelectedNode = useSetSelectedNode();
    const theme = useTheme();
    const user = useUser() || undefined;
    const userPermissions = useUserPermissions();

    const context = useMemo(() => ({ theme, user }), [theme, user]);
    const getDocumentModelModule = useGetDocumentModelModule();

    const canUndo =
        selectedDocument &&
        (selectedDocument.revision.global > 0 ||
            selectedDocument.revision.local > 0);
    const canRedo = selectedDocument && !!selectedDocument.clipboard.length;

    const dispatch = useEditorDispatch(documentDispatch, onAddOperation);

    const handleUndo = useCallback(() => {
        dispatch(undo());
    }, [dispatch]);

    const handleRedo = useCallback(() => {
        dispatch(redo());
    }, [dispatch]);

    const onClose = useCallback(() => {
        setSelectedNode(parentFolder);
    }, [parentFolder, setSelectedNode]);

    const exportDocument = useCallback(
        (document: PHDocument) => {
            const validationErrors = validateDocument(document);

            if (validationErrors.length) {
                showExportWithErrorsModal({
                    document,
                    validationErrors,
                });
            } else {
                return exportFile(document, getDocumentModelModule);
            }
        },
        [getDocumentModelModule, showExportWithErrorsModal],
    );

    const onExport = useCallback(() => {
        if (selectedDocument) {
            return exportDocument(selectedDocument);
        }
    }, [exportDocument, selectedDocument]);

    const [revisionHistoryVisible, setRevisionHistoryVisible] = useState(false);
    const showRevisionHistory = useCallback(
        () => setRevisionHistoryVisible(true),
        [],
    );

    return {
        dispatch,
        revisionHistoryVisible,
        context,
        canUndo,
        canRedo,
        undo: handleUndo,
        redo: handleRedo,
        onClose,
        onExport,
        onShowRevisionHistory: showRevisionHistory,
        isAllowedToCreateDocuments:
            userPermissions?.isAllowedToCreateDocuments ?? false,
        isAllowedToEditDocuments:
            userPermissions?.isAllowedToEditDocuments ?? false,
    };
}
