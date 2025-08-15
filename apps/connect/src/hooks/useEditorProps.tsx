import { useModal } from '#components';
import {
    addActionContext,
    type DocumentDispatch,
    type DocumentDispatchCallback,
    exportFile,
    signOperation,
    validateDocument,
} from '#utils';
import {
    setSelectedNode,
    useConnectCrypto,
    useDid,
    useDocumentModelModuleById,
    useParentFolder,
    useUser,
    useUserPermissions,
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
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
    const did = useDid();
    const connectCrypto = useConnectCrypto();
    const documentType = document?.header.documentType;
    const documentModelModule = useDocumentModelModuleById(documentType);

    const dispatch = (
        action: Action,
        onErrorCallback?: ActionErrorCallback,
    ) => {
        const callback: DocumentDispatchCallback<PHDocument> = (
            operation,
            state,
        ) => {
            if (!document?.header.id || !connectCrypto) return;

            const { prevState } = state;

            signOperation(
                operation,
                connectCrypto.sign,
                document.header.id,
                prevState,
                documentModelModule?.reducer,
                user,
            )
                .then(op => {
                    window.documentEditorDebugTools?.pushOperation(operation);
                    return onAddOperation(op);
                })
                .catch(logger.error);
        };

        documentDispatch(
            addActionContext(action, did, user),
            callback,
            onErrorCallback,
        );
    };

    return dispatch;
}

export function useEditorProps<T extends PHDocument = PHDocument>(
    document: T | undefined,
    documentDispatch: DocumentDispatch<T>,
    onAddOperation: (operation: Operation) => Promise<void>,
) {
    const { t } = useTranslation();
    const { showModal } = useModal();
    const userPermissions = useUserPermissions();
    const parentFolder = useParentFolder(document?.header.id);
    const documentModelModule = useDocumentModelModuleById(
        document?.header.documentType,
    );

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
        canUndo,
        canRedo,
        undo: handleUndo,
        redo: handleRedo,
        onClose: () => setSelectedNode(parentFolder),
        onExport,
        onShowRevisionHistory: showRevisionHistory,
        isAllowedToCreateDocuments:
            userPermissions?.isAllowedToCreateDocuments ?? false,
        isAllowedToEditDocuments:
            userPermissions?.isAllowedToEditDocuments ?? false,
    };
}
