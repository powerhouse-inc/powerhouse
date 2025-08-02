import { useModal } from '#components';
import { themeAtom, useUser } from '#store';
import {
    addActionContext,
    type DocumentDispatch,
    type DocumentDispatchCallback,
    exportFile,
    signOperation,
    validateDocument,
} from '#utils';
import {
    useDocumentModelModuleById,
    useParentFolder,
    useSetSelectedNode,
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

export function useEditorDispatch<T extends PHDocument = PHDocument>(
    document: T | undefined,
    documentDispatch: DocumentDispatch<T>,
    onAddOperation: (operation: Operation) => Promise<void>,
) {
    const user = useUser() || undefined;
    const connectDid = useConnectDid();
    const { sign } = useConnectCrypto();
    const documentType = document?.header.documentType;
    const documentModelModule = useDocumentModelModuleById(documentType);

    const dispatch = useCallback(
        (action: Action, onErrorCallback?: ActionErrorCallback) => {
            const callback: DocumentDispatchCallback<PHDocument> = (
                operation,
                state,
            ) => {
                if (!document?.header.id) return;

                const { prevState } = state;

                signOperation(
                    operation,
                    sign,
                    document.header.id,
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
            document?.header.id,
            sign,
            user,
        ],
    );

    return dispatch;
}

export function useEditorProps<T extends PHDocument = PHDocument>(
    document: T | undefined,
    documentDispatch: DocumentDispatch<T>,
    onAddOperation: (operation: Operation) => Promise<void>,
) {
    const { t } = useTranslation();
    const { showModal } = useModal();
    const theme = useAtomValue(themeAtom);
    const user = useUser() || undefined;
    const userPermissions = useUserPermissions();
    const parentFolder = useParentFolder(document?.header.id);
    const setSelectedNode = useSetSelectedNode();
    const documentModelModule = useDocumentModelModuleById(
        document?.header.documentType,
    );
    const context = useMemo(() => ({ theme, user }), [theme, user]);

    const canUndo =
        !!document &&
        (document.header.revision.global > 0 ||
            document.header.revision.local > 0);
    const canRedo = !!document?.clipboard.length;

    const dispatch = useEditorDispatch(
        document,
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
        setSelectedNode(parentFolder?.id);
    }, [parentFolder, setSelectedNode]);

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
                        return exportFile(document, documentModelModule);
                    },
                });
            } else {
                return exportFile(document, documentModelModule);
            }
        },
        [documentModelModule, showModal, t],
    );

    const onExport = useCallback(() => {
        if (document) {
            return exportDocument(document);
        }
    }, [exportDocument, document]);

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
