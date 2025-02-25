import { UiDriveNode, UiFileNode } from '@powerhousedao/design-system';
import {
    Action,
    ActionErrorCallback,
    actions,
    BaseAction,
    Document,
    EditorContext,
    Operation,
} from 'document-model/document';
import { useAtomValue } from 'jotai';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModal } from 'src/components/modal';
import { useGetDocumentModel } from 'src/store/document-model';
import { themeAtom } from 'src/store/theme';
import { useUser } from 'src/store/user';
import {
    DocumentDispatch,
    DocumentDispatchCallback,
    exportFile,
} from 'src/utils';
import { addActionContext, signOperation } from 'src/utils/signature';
import { validateDocument } from 'src/utils/validate-document';
import { useConnectCrypto, useConnectDid } from './useConnectCrypto';
import { useUiNodes } from './useUiNodes';
import { useUserPermissions } from './useUserPermissions';
import { logger } from 'document-drive/logger';

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
    documentDispatch: DocumentDispatch<any, any, any>,
    onAddOperation: (operation: Operation) => Promise<void>,
) {
    const user = useUser() || undefined;
    const connectDid = useConnectDid();
    const { sign } = useConnectCrypto();

    const documentType =
        node?.kind === 'DRIVE'
            ? 'powerhouse/document-drive'
            : node?.documentType;
    const getDocumentModel = useGetDocumentModel();
    const documentModel = useMemo(
        () => (documentType ? getDocumentModel(documentType) : undefined),
        [documentType, getDocumentModel],
    );

    const dispatch = useCallback(
        (
            action: BaseAction | Action,
            onErrorCallback?: ActionErrorCallback,
        ) => {
            console.log('OLAAAA');
            const callback: DocumentDispatchCallback<
                unknown,
                Action,
                unknown
            > = (operation, state) => {
                if (!node?.id) return;

                const { prevState } = state;

                signOperation(
                    operation,
                    sign,
                    node.id,
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

            documentDispatch(
                addActionContext(action, connectDid, user),
                callback,
                onErrorCallback,
            );
        },
        [
            documentDispatch,
            connectDid,
            documentModel?.reducer,
            onAddOperation,
            node,
            sign,
            user,
        ],
    );

    return dispatch;
}

export function useEditorProps(
    document: Document<any, any> | undefined,
    node: UiDriveNode | UiFileNode | null,
    documentDispatch: DocumentDispatch<any, any, any>,
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
        getDocumentModel,
    } = useUiNodes();

    const canUndo =
        !!document &&
        (document.revision.global > 0 || document.revision.local > 0);
    const canRedo = !!document?.clipboard.length;

    const dispatch = useEditorDispatch(node, documentDispatch, onAddOperation);

    const undo = useCallback(() => {
        dispatch(actions.undo());
    }, [dispatch]);

    const redo = useCallback(() => {
        dispatch(actions.undo());
    }, [dispatch]);

    const onClose = useCallback(() => {
        setSelectedNode(selectedParentNode);
    }, [selectedParentNode, setSelectedNode]);

    const exportDocument = useCallback(
        (document: Document) => {
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
                        return exportFile(document, getDocumentModel);
                    },
                });
            } else {
                return exportFile(document, getDocumentModel);
            }
        },
        [getDocumentModel, showModal, t],
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
        undo,
        redo,
        onClose,
        onExport,
        onShowRevisionHistory: showRevisionHistory,
        isAllowedToCreateDocuments:
            userPermissions?.isAllowedToCreateDocuments ?? false,
        isAllowedToEditDocuments:
            userPermissions?.isAllowedToEditDocuments ?? false,
    };
}
