import {
    ActionType,
    Breadcrumbs,
    ConnectSearchBar,
    ItemType,
    TreeItem,
    decodeID,
    encodeID,
    getRootPath,
    useGetItemByPath,
    useItemActions,
} from '@powerhousedao/design-system';
import { Document, DocumentModel } from 'document-model/document';
import path from 'path';
import { useEffect, useState } from 'react';
import Button from 'src/components/button';
import { DocumentEditor } from 'src/components/editors';
import FolderView from 'src/components/folder-view';
import { useDocumentDrive } from 'src/hooks/useDocumentDrive';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { preloadTabs, useFileNodeDocument, useSelectedPath } from 'src/store';
import {
    useDocumentModels,
    useGetDocumentModel,
} from 'src/store/document-model';
import { exportFile } from 'src/utils';
import { v4 as uuid } from 'uuid';

const Content = () => {
    const [selectedPath, setSelectedPath] = useSelectedPath();
    const getItemByPath = useGetItemByPath();
    const actions = useItemActions();

    const selectedFolder = getItemByPath(selectedPath || '');
    const driveID = getRootPath(selectedFolder?.path ?? '');
    const decodedDriveID = decodeID(driveID);

    const { addFile, addDocument, deleteNode } = useDocumentDrive();
    const documentModels = useDocumentModels();
    const getDocumentModel = useGetDocumentModel();
    const { onSubmitInput } = useDrivesContainer();

    const [selectedFileNode, setSelectedFileNode] = useState<
        { drive: string; path: string } | undefined
    >(undefined);
    const [selectedDocument, updateDocument, saveDocument] =
        useFileNodeDocument(selectedFileNode?.drive, selectedFileNode?.path);

    // preload document editors
    useEffect(() => {
        preloadTabs();
    }, []);

    useEffect(() => {
        return window.electronAPI?.handleFileOpen(async file => {
            if (!selectedPath) {
                return;
            }
            const fileNode = await addFile(file, decodedDriveID, '');
            if (fileNode) {
                setSelectedFileNode({
                    drive: decodedDriveID,
                    path: fileNode.path,
                });
            }
        });
    }, [selectedPath]);

    async function handleFileSave() {
        if (!selectedDocument) {
            throw new Error('No document selected');
        }

        saveDocument();
    }

    useEffect(() => {
        const removeHandler =
            window.electronAPI?.handleFileSave(handleFileSave);

        function handleKeyboardSave(e: KeyboardEvent) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleFileSave();
            }
        }

        document.addEventListener('keydown', handleKeyboardSave);

        return () => {
            removeHandler?.();
            document.removeEventListener('keydown', handleKeyboardSave);
        };
    }, [saveDocument]);

    async function createDocument(documentModel: DocumentModel) {
        if (!driveID || !selectedFolder) {
            throw new Error('No drive selected');
        }

        // remove first segment of path
        const itemPath = selectedFolder.path.split('/').slice(1).join('/');

        const node = await addDocument(
            documentModel.utils.createDocument(),
            decodedDriveID,
            itemPath,
            `New ${documentModel.documentModel.name}`
        );

        if (node) {
            setSelectedFileNode({ drive: decodedDriveID, path: node.path });
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

    const onFolderSelectedHandler = (drive: string, folderPath: string) => {
        const itemPath = path.join(encodeID(drive), folderPath);
        const item = getItemByPath(itemPath);

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
            type: ItemType.Folder,
            action: ActionType.New,
        });

        const item = getItemByPath(itemPath);

        if (item) {
            selectFolder(item);
        }
    };

    return (
        <div className="flex h-full flex-col bg-[#F4F4F4] p-6">
            {selectedDocument ? (
                <div className="flex-1 rounded-[20px] bg-[#FCFCFC] p-4">
                    <DocumentEditor
                        document={selectedDocument}
                        onChange={updateDocument}
                        onSave={saveDocument}
                        onClose={() => setSelectedFileNode(undefined)}
                        onExport={() => exportDocument(selectedDocument)}
                    />
                </div>
            ) : (
                <>
                    <ConnectSearchBar className="mb-5 flex-shrink-0 bg-[#FCFCFC]" />
                    <div className="flex-grow overflow-auto rounded-[20px] bg-[#FCFCFC] p-2">
                        {selectedPath && (
                            <Breadcrumbs
                                filterPath={selectedPath}
                                onItemClick={(e, itemPath) => {
                                    const item = getItemByPath(itemPath);
                                    if (item) {
                                        selectFolder(item);
                                    }
                                }}
                                onAddNewItem={() => {}}
                                onSubmitInput={submitNewFolderAndSelect}
                                onCancelInput={console.log}
                            />
                        )}
                        <div className="px-4">
                            <div className="py-3">
                                {selectedFolder && (
                                    <FolderView
                                        drive={decodedDriveID}
                                        folder={selectedFolder}
                                        onFolderSelected={
                                            onFolderSelectedHandler
                                        }
                                        onFileSelected={(drive, path) =>
                                            setSelectedFileNode({ drive, path })
                                        }
                                        onFileDeleted={deleteNode}
                                    />
                                )}
                            </div>
                            <h3 className="mb-3 mt-4 text-xl font-bold">
                                New document
                            </h3>
                            <div className="flex w-full flex-wrap gap-4">
                                {documentModels.map(doc => (
                                    <Button
                                        key={doc.documentModel.id}
                                        aria-details={
                                            doc.documentModel.description
                                        }
                                        className="bg-accent-1 text-text"
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
