import { useModal } from '#components/modal/index';
import { useGetDocumentModelModule } from '#store/document-model';
import { themeAtom } from '#store/theme';
import { useUser } from '#store/user';
import {
    type DocumentDispatch,
    type DocumentDispatchCallback,
} from '#utils/document-model';
import { exportFile } from '#utils/file';
import { addActionContext, signOperation } from '#utils/signature';
import { validateDocument } from '#utils/validate-document';
import {
    type UiDriveNode,
    type UiFileNode,
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
import { useAtomValue } from 'jotai';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnectCrypto, useConnectDid } from './useConnectCrypto';
import { useUiNodes } from './useUiNodes';
import { useUserPermissions } from './useUserPermissions';

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
    node: UiDriveNode | UiFileNode | null,
    documentDispatch: DocumentDispatch<PHDocument>,
    onAddOperation: (operation: Operation) => Promise<void>,
) {
    const user = useUser() || undefined;
    const connectDid = useConnectDid();
    const { sign } = useConnectCrypto();

    const documentType =
        node?.kind === 'DRIVE'
            ? 'powerhouse/document-drive'
            : node?.documentType;
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
                if (!node?.id) return;

                const { prevState } = state;

                signOperation(
                    operation,
                    sign,
                    node.id,
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
            node,
            sign,
            user,
        ],
    );

    return dispatch;
}

export function useEditorProps(
    document: PHDocument | undefined,
    node: UiDriveNode | UiFileNode | null,
    documentDispatch: DocumentDispatch<PHDocument>,
    onAddOperation: (operation: Operation) => Promise<void>,
) {
    const { t } = useTranslation();
    const { showModal } = useModal();
    const theme = useAtomValue(themeAtom);
    const user = useUser() || undefined;
    const userPermissions = useUserPermissions();

    const context = useMemo(() => ({ theme, user }), [theme, user]);

    const {
        selectedParentNode,
        selectedDocument,
        setSelectedNode,
        getDocumentModelModule,
    } = useUiNodes();

    const canUndo =
        !!document &&
        (document.revision.global > 0 || document.revision.local > 0);
    const canRedo = !!document?.clipboard.length;

    const dispatch = useEditorDispatch(node, documentDispatch, onAddOperation);

    const handleUndo = useCallback(() => {
        dispatch(undo());
    }, [dispatch]);

    const handleRedo = useCallback(() => {
        dispatch(redo());
    }, [dispatch]);

    const onClose = useCallback(() => {
        setSelectedNode(selectedParentNode);
    }, [selectedParentNode, setSelectedNode]);

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
