import { useModal } from '#components';
import {
    themeAtom,
    useFileNodeDocument,
    useGetDocumentModelModule,
    useUser,
} from '#store';
import {
    addActionContext,
    type DocumentDispatch,
    type DocumentDispatchCallback,
    exportFile,
    signOperation,
    validateDocument,
} from '#utils';
import {
    useNodeDocumentType,
    useParentNodeId,
    useSetSelectedNodeId,
} from '@powerhousedao/reactor-browser';
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
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
    nodeId: string | null,
    documentDispatch: DocumentDispatch<PHDocument>,
    onAddOperation: (operation: Operation) => Promise<void>,
) {
    const user = useUser() || undefined;
    const connectDid = useConnectDid();
    const documentType = useNodeDocumentType(nodeId);
    const { sign } = useConnectCrypto();
    const getDocumentModelModule = useGetDocumentModelModule();
    const documentModelModule = useMemo(
        () => (documentType ? getDocumentModelModule(documentType) : undefined),
        [documentType, getDocumentModelModule],
    );

    const dispatch = useCallback(
        (action: Action, onErrorCallback?: ActionErrorCallback) => {
            const callback: DocumentDispatchCallback<PHDocument> = (
                operation,
                state,
            ) => {
                if (!nodeId) return;

                const { prevState } = state;

                signOperation(
                    operation,
                    sign,
                    nodeId,
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
            };

            documentDispatch(
                addActionContext(action, connectDid, user),
                callback,
                onErrorCallback,
            );
        },
        [
            documentDispatch,
            connectDid,
            documentModelModule?.reducer,
            onAddOperation,
            nodeId,
            sign,
            user,
        ],
    );

    return dispatch;
}

export function useEditorProps(
    document: PHDocument | undefined,
    nodeId: string | null,
    documentDispatch: DocumentDispatch<PHDocument>,
    onAddOperation: (operation: Operation) => Promise<void>,
) {
    const { t } = useTranslation();
    const { showModal } = useModal();
    const parentNodeId = useParentNodeId(nodeId);
    const setSelectedNodeId = useSetSelectedNodeId();
    const theme = useAtomValue(themeAtom);
    const user = useUser() || undefined;
    const userPermissions = useUserPermissions();

    const context = useMemo(() => ({ theme, user }), [theme, user]);
    const { selectedDocument } = useFileNodeDocument();
    const getDocumentModelModule = useGetDocumentModelModule();

    const canUndo =
        !!document &&
        (document.revision.global > 0 || document.revision.local > 0);
    const canRedo = !!document?.clipboard.length;

    const dispatch = useEditorDispatch(
        nodeId,
        documentDispatch,
        onAddOperation,
    );

    const handleUndo = useCallback(() => {
        dispatch(undo());
    }, [dispatch]);

    const handleRedo = useCallback(() => {
        dispatch(redo());
    }, [dispatch]);

    const onClose = useCallback(() => {
        setSelectedNodeId(parentNodeId);
    }, [parentNodeId, setSelectedNodeId]);

    const exportDocument = useCallback(
        (document: PHDocument) => {
            const validationErrors = validateDocument(document);

            if (validationErrors.length) {
                showModal('confirmationModal', {
                    title: t('modals.exportDocumentWithErrors.title'),
                    body: (
                        <div>
                            <p>{t('modals.exportDocumentWithErrors.body')}</p>
                            <ul className="mt-4 flex list-disc flex-col items-start px-4 text-xs">
                                {validationErrors.map((error, index) => (
                                    <li key={index}>{error.message}</li>
                                ))}
                            </ul>
                        </div>
                    ),
                    cancelLabel: t('common.cancel'),
                    continueLabel: t('common.export'),
                    onCancel(closeModal) {
                        closeModal();
                    },
                    onContinue(closeModal) {
                        closeModal();
                        return exportFile(document, getDocumentModelModule);
                    },
                });
            } else {
                return exportFile(document, getDocumentModelModule);
            }
        },
        [getDocumentModelModule, showModal, t],
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
