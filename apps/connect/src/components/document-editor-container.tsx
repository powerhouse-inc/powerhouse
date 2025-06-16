import {
    useDocumentDriveById,
    useDocumentDriveServer,
    useGetDocument,
} from '#hooks';
import { useFileNodeDocument, useGetDocumentModelModule } from '#store';
import { useUiNodesContext } from '@powerhousedao/reactor-browser';
import { type GetDocumentOptions } from 'document-drive';
import {
    type EditorContext,
    type Operation,
    type PHDocument,
} from 'document-model';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useModal } from '../components/modal/index.js';
import { exportFile } from '../utils/index.js';
import { validateDocument } from '../utils/validate-document.js';
import { DocumentEditor } from './editors.js';

export function DocumentEditorContainer() {
    const { t } = useTranslation();
    const { showModal } = useModal();
    const {
        selectedDocument,
        fileNodeDocument,
        setSelectedDocument,
        addOperationToSelectedDocument,
    } = useFileNodeDocument();
    const { renameNode } = useDocumentDriveServer();
    const {
        selectedNode,
        selectedDriveNode,
        selectedParentNode,
        setSelectedNode,
    } = useUiNodesContext();
    const { isRemoteDrive } = useDocumentDriveById(selectedDriveNode?.id);
    const openSwitchboardLink = useOpenSwitchboardLink(selectedDriveNode?.id);
    const getDocumentModelModule = useGetDocumentModelModule();

    const getDocument = useGetDocument();

    const handleAddOperationToSelectedDocument = useCallback(
        async (operation: Operation) => {
            if (!selectedDocument) {
                throw new Error('No document selected');
            }
            if (!addOperationToSelectedDocument) {
                throw new Error('No add operation function defined');
            }
            await addOperationToSelectedDocument(operation);
        },
        [addOperationToSelectedDocument, selectedDocument],
    );

    const onDocumentChangeHandler = useCallback(
        (documentId: string, document: PHDocument) => {
            if (documentId !== fileNodeDocument?.documentId) {
                return;
            }
            setSelectedDocument(document);

            if (
                !!selectedNode &&
                document.name !== '' &&
                selectedNode.name !== document.name
            ) {
                return renameNode(
                    selectedNode.driveId,
                    selectedNode.id,
                    document.name,
                );
            }
        },
        [
            fileNodeDocument?.documentId,
            renameNode,
            selectedNode,
            setSelectedDocument,
        ],
    );

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

    const onGetDocumentRevision: EditorContext['getDocumentRevision'] =
        useCallback(
            (options?: GetDocumentOptions) => {
                if (!selectedNode) {
                    console.error('No selected node');
                    return Promise.reject(new Error('No selected node'));
                }
                return getDocument(
                    selectedNode.driveId,
                    selectedNode.id,
                    options,
                );
            },
            [getDocument, selectedNode],
        );

    const onExport = useCallback(() => {
        if (selectedDocument) {
            return exportDocument(selectedDocument);
        }
    }, [exportDocument, selectedDocument]);

    const onOpenSwitchboardLink = useMemo(() => {
        return isRemoteDrive
            ? () => openSwitchboardLink(selectedNode)
            : undefined;
    }, [isRemoteDrive, openSwitchboardLink, selectedNode]);

    if (!fileNodeDocument) return null;

    return (
        <div
            key={fileNodeDocument.documentId}
            className="flex-1 rounded-2xl bg-gray-50 p-4"
        >
            <DocumentEditor
                fileNodeDocument={fileNodeDocument}
                document={selectedDocument}
                onChange={onDocumentChangeHandler}
                onClose={onClose}
                onExport={onExport}
                onGetDocumentRevision={onGetDocumentRevision}
                onAddOperation={handleAddOperationToSelectedDocument}
                onOpenSwitchboardLink={onOpenSwitchboardLink}
            />
        </div>
    );
}
