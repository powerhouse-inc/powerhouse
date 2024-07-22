import { Breadcrumbs, FILE } from '@powerhousedao/design-system';
import { Document, DocumentModel, Operation } from 'document-model/document';
import { Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Button from 'src/components/button';
import { DocumentEditor } from 'src/components/editors';
import FolderView from 'src/components/folder-view';
import { useModal } from 'src/components/modal';
import { SearchBar } from 'src/components/search-bar';
import { useConnectConfig } from 'src/hooks/useConnectConfig';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useUiNodes } from 'src/hooks/useUiNodes';
import { useFileNodeDocument } from 'src/store/document-drive';
import {
    useFilteredDocumentModels,
    useGetDocumentModel,
} from 'src/store/document-model';
import { usePreloadEditor } from 'src/store/editor';
import { exportFile } from 'src/utils';
import { validateDocument } from 'src/utils/validate-document';

const getDocumentModelName = (name: string) => {
    if (name === 'RealWorldAssets') {
        return 'RWA Portfolio';
    }

    return name;
};

const Content = () => {
    const [connectConfig] = useConnectConfig();
    const { t } = useTranslation();
    const uiNodes = useUiNodes();
    const {
        selectedNode,
        selectedDriveNode,
        selectedParentNode,
        isRemoteDrive,
        isAllowedToCreateDocuments,
        setSelectedNode,
        openSwitchboardLink,
    } = useUiNodes();
    const { showModal } = useModal();
    const { addFile, renameNode } = useDocumentDriveServer();
    const documentModels = useFilteredDocumentModels();
    const getDocumentModel = useGetDocumentModel();
    const [selectedDocument, setSelectedDocument, addOperation] =
        useFileNodeDocument(selectedDriveNode?.id, selectedNode?.id);
    const preloadEditor = usePreloadEditor();

    // preload document editors
    useEffect(() => {
        // waits 1 second to preload editors
        const requestIC = window.requestIdleCallback ?? setTimeout;
        const cancelIC = window.cancelIdleCallback ?? clearTimeout;

        const id = requestIC(async () => {
            for (const documentModel of documentModels) {
                await preloadEditor(documentModel.documentModel.id);
            }
        });
        return () => cancelIC(id);
    }, [documentModels, preloadEditor]);

    useEffect(() => {
        return window.electronAPI?.handleFileOpen(async file => {
            if (!selectedDriveNode || selectedNode?.kind !== FILE) {
                return;
            }

            await addFile(
                file.content,
                selectedDriveNode.id,
                file.name,
                selectedNode.parentFolder,
            );
        });
    }, [selectedDriveNode, selectedNode, addFile]);

    async function handleAddOperation(operation: Operation) {
        if (!selectedDocument) {
            throw new Error('No document selected');
        }
        if (!addOperation) {
            throw new Error('No add operation function defined');
        }
        await addOperation(operation);
    }

    function createDocument(documentModel: DocumentModel) {
        if (!selectedDriveNode) return;

        showModal('createDocument', {
            documentModel,
            selectedParentNode,
            setSelectedNode,
        });
    }

    function exportDocument(document: Document) {
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
    }

    const onOpenSwitchboardLink = async () => {
        await openSwitchboardLink(selectedNode);
    };

    const onDocumentChangeHandler = (document: Document) => {
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
    };

    return (
        <div className="flex h-full flex-col overflow-auto bg-gray-100 p-6">
            {selectedNode && selectedDocument ? (
                <div className="flex-1 rounded-2xl bg-gray-50 p-4">
                    <Suspense
                        fallback={
                            <div className="flex h-full animate-pulse items-center justify-center">
                                <h3 className="text-xl">Loading editor</h3>
                            </div>
                        }
                    >
                        <DocumentEditor
                            document={selectedDocument}
                            fileNodeId={selectedNode.id}
                            onClose={() => {
                                setSelectedNode(selectedParentNode);
                            }}
                            fileId={selectedNode.id}
                            onChange={onDocumentChangeHandler}
                            onExport={() => exportDocument(selectedDocument)}
                            onAddOperation={handleAddOperation}
                            {...(isRemoteDrive && { onOpenSwitchboardLink })}
                        />
                    </Suspense>
                </div>
            ) : (
                <>
                    <div className="grow overflow-auto rounded-2xl bg-gray-50 p-2">
                        <Breadcrumbs {...uiNodes} />
                        {connectConfig.content.showSearchBar && <SearchBar />}
                        <div className="px-4">
                            <div className="mb-5">
                                <FolderView {...uiNodes} />
                            </div>
                            {isAllowedToCreateDocuments && (
                                <>
                                    <h3 className="mb-3 mt-4 text-xl font-bold text-gray-600">
                                        New document
                                    </h3>
                                    <div className="flex w-full flex-wrap gap-4">
                                        {documentModels.map(doc => (
                                            <Button
                                                key={doc.documentModel.id}
                                                aria-details={
                                                    doc.documentModel
                                                        .description
                                                }
                                                className="bg-gray-200 text-slate-800"
                                                onClick={() =>
                                                    createDocument(doc)
                                                }
                                            >
                                                <span className="text-sm">
                                                    {getDocumentModelName(
                                                        doc.documentModel.name,
                                                    )}
                                                </span>
                                            </Button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export const element = <Content />;
export default Content;
