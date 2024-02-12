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
import { Document, DocumentModel, Operation } from 'document-model/document';
import path from 'path';
import { useEffect, useState } from 'react';
import Button from 'src/components/button';
import { DocumentEditor } from 'src/components/editors';
import FolderView from 'src/components/folder-view';
import { SearchBar } from 'src/components/search-bar';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { preloadTabs, useFileNodeDocument, useSelectedPath } from 'src/store';
import {
    useDocumentModels,
    useGetDocumentModel,
} from 'src/store/document-model';
import { exportFile } from 'src/utils';
import { v4 as uuid } from 'uuid';

const Content = () => {
    const { items } = useItemsContext();
    const [selectedPath, setSelectedPath] = useSelectedPath();
    const getItemByPath = useGetItemByPath();
    const getItemById = useGetItemById();
    const actions = useItemActions();

    const selectedFolder = getItemByPath(selectedPath || '');
    const driveID = getRootPath(selectedFolder?.path ?? '');
    const decodedDriveID = decodeID(driveID);

    const { addFile, addDocument, deleteNode, documentDrives, renameNode } =
        useDocumentDriveServer();
    const documentModels = useDocumentModels();
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
        addOperation(operation);
    }

    async function createDocument(documentModel: DocumentModel) {
        if (!driveID || !selectedFolder) {
            throw new Error('No drive selected');
        }

        // remove first segment of path
        const parentFolder = selectedFolder.path.split('/').slice(1).pop();

        const node = await addDocument(
            decodedDriveID,
            `New ${documentModel.documentModel.name}`,
            documentModel.documentModel.id,
            parentFolder ? decodeID(parentFolder) : undefined,
        );

        if (node) {
            if (!driveNodes) {
                throw new Error(`Drive with id ${decodedDriveID} not found`);
            }
            setSelectedFileNode({
                drive: decodedDriveID,
                id: node.id,
            });
        }
    }

    async function exportDocument(document: Document) {
        exportFile(document, getDocumentModel);
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
            renameNode(decodedDriveID, item.id, document.name);
        }
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
                                            {doc.documentModel.name}
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
