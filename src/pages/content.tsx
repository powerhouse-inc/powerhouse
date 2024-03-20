import {
    Breadcrumbs,
    TreeItem,
    decodeID,
    getRootPath,
    useGetItemById,
    useGetItemByPath,
    useItemActions,
    useItemsContext,
} from '@powerhousedao/design-system';
import { FileNode } from 'document-model-libs/document-drive';
import { Document, DocumentModel, Operation } from 'document-model/document';
import path from 'path';
import { useEffect, useState } from 'react';
import Button from 'src/components/button';
import { DocumentEditor } from 'src/components/editors';
import FolderView from 'src/components/folder-view';
import { useModal } from 'src/components/modal';
import { SearchBar } from 'src/components/search-bar';
import { useDocumentDriveById } from 'src/hooks/useDocumentDriveById';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { useGetDocumentById } from 'src/hooks/useGetDocumentById';
import { useOpenSwitchboardLink } from 'src/hooks/useOpenSwitchboardLink';
import { useFileNodeDocument, useSelectedPath } from 'src/store/document-drive';
import {
    useFilteredDocumentModels,
    useGetDocumentModel,
} from 'src/store/document-model';
import { preloadTabs } from 'src/store/tabs';
import { exportFile } from 'src/utils';
import { v4 as uuid } from 'uuid';

const getDocumentModelName = (name: string) => {
    if (name === 'RealWorldAssets') {
        return 'RWA Portfolio';
    }

    return name;
};

const Content = () => {
    const { items } = useItemsContext();
    const [selectedPath, setSelectedPath] = useSelectedPath();
    const getItemByPath = useGetItemByPath();
    const getItemById = useGetItemById();
    const actions = useItemActions();

    const selectedFolder = getItemByPath(selectedPath || '');
    const driveID = getRootPath(selectedFolder?.path ?? '');
    const decodedDriveID = decodeID(driveID);
    const { showModal } = useModal();
    const getDocumentById = useGetDocumentById();
    const { isRemoteDrive } = useDocumentDriveById(decodedDriveID);
    const openSwitchboardLink = useOpenSwitchboardLink(decodedDriveID);

    const { addFile, deleteNode, documentDrives, renameNode } =
        useDocumentDriveServer();
    const documentModels = useFilteredDocumentModels();
    const getDocumentModel = useGetDocumentModel();
    const { onSubmitInput } = useDrivesContainer();

    const driveNodes = documentDrives.find(
        drive => drive.state.global.id === decodedDriveID,
    )?.state.global.nodes;

    const [selectedFileNode, setSelectedFileNode] = useState<
        { drive: string; id: string } | undefined
    >(undefined);
    const [selectedDocument, , addOperation] = useFileNodeDocument(
        decodedDriveID,
        selectedFileNode?.id,
    );

    // preload document editors
    useEffect(() => {
        preloadTabs();
    }, []);

    useEffect(() => {
        return window.electronAPI?.handleFileOpen(async file => {
            if (!selectedPath) {
                return;
            }
            const fileNode = await addFile(
                file.content,
                decodedDriveID,
                file.name,
                selectedFolder && selectedFolder.type === 'FOLDER'
                    ? decodeID(selectedFolder.id)
                    : undefined,
            );
            if (!driveNodes) {
                throw new Error(`Drive with id ${decodedDriveID} not found`);
            }

            if (fileNode) {
                setSelectedFileNode({
                    drive: decodedDriveID,
                    id: fileNode.id,
                });
            }
        });
    }, [selectedPath]);

    function handleAddOperation(operation: Operation) {
        if (!selectedDocument) {
            throw new Error('No document selected');
        }
        if (!addOperation) {
            throw new Error('No add operation function defined');
        }
        return addOperation(operation);
    }

    function createDocument(documentModel: DocumentModel) {
        showModal('createDocument', {
            documentModel,
            selectedFolder,
            driveID: decodedDriveID,
            driveNodes,
            setSelectedFileNode,
        });
    }

    function exportDocument(document: Document) {
        return exportFile(document, getDocumentModel);
    }

    const selectFolder = (item: TreeItem) => {
        actions.setExpandedItem(item.id, true);
        actions.setSelectedItem(item.id);
        setSelectedPath(item.path);
    };

    const onFolderSelectedHandler = (itemId: string) => {
        const item = items.find(item => item.id === itemId);

        if (item) {
            selectFolder(item);
        }
    };

    const submitNewFolderAndSelect = (basepath: string, label: string) => {
        const itemPath = path.join(basepath, label);
        onSubmitInput({
            label,
            id: uuid(),
            path: itemPath,
            type: 'FOLDER',
            action: 'NEW',
        });

        const item = getItemByPath(itemPath);

        if (item) {
            selectFolder(item);
        }
    };

    const onDocumentChangeHandler = (document: Document) => {
        const item = selectedFileNode?.id
            ? getItemById(selectedFileNode.id)
            : undefined;

        if (document.name !== '' && item && item.label !== document.name) {
            return renameNode(decodedDriveID, item.id, document.name);
        }
    };

    const onOpenSwitchboardLink = async () => {
        const doc = getDocumentById(
            decodedDriveID,
            selectedFileNode?.id || '',
        ) as FileNode | undefined;

        await openSwitchboardLink(doc);
    };

    return (
        <div className="flex h-full flex-col overflow-auto bg-gray-100 p-6">
            {selectedFileNode && selectedDocument ? (
                <div className="flex-1 rounded-2xl bg-gray-50 p-4">
                    <DocumentEditor
                        document={selectedDocument}
                        onClose={() => setSelectedFileNode(undefined)}
                        onChange={onDocumentChangeHandler}
                        onExport={() => exportDocument(selectedDocument)}
                        onAddOperation={handleAddOperation}
                        {...(isRemoteDrive && { onOpenSwitchboardLink })}
                    />
                </div>
            ) : (
                <>
                    <div className="grow overflow-auto rounded-2xl bg-gray-50 p-2">
                        {selectedPath && (
                            <Breadcrumbs
                                filterPath={selectedPath}
                                onItemClick={(e, itemPath) => {
                                    const item = getItemByPath(itemPath);
                                    if (item) {
                                        selectFolder(item);
                                    }
                                }}
                                onAddNewItem={() => undefined}
                                onSubmitInput={submitNewFolderAndSelect}
                                onCancelInput={console.log}
                            />
                        )}
                        <SearchBar />
                        <div className="px-4">
                            <div className="mb-5">
                                <FolderView
                                    drive={decodedDriveID}
                                    path={selectedPath || ''}
                                    onFolderSelected={onFolderSelectedHandler}
                                    onFileSelected={(drive, id) =>
                                        setSelectedFileNode({ drive, id })
                                    }
                                    onFileDeleted={deleteNode}
                                />
                            </div>
                            <h3 className="mb-3 mt-4 text-xl font-bold text-gray-600">
                                New document
                            </h3>
                            <div className="flex w-full flex-wrap gap-4">
                                {documentModels.map(doc => (
                                    <Button
                                        key={doc.documentModel.id}
                                        aria-details={
                                            doc.documentModel.description
                                        }
                                        className="bg-gray-200 text-slate-800"
                                        onClick={() => createDocument(doc)}
                                    >
                                        <span className="text-sm">
                                            {getDocumentModelName(
                                                doc.documentModel.name,
                                            )}
                                        </span>
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export const element = <Content />;
export default Content;
