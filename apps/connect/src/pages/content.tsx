import { Breadcrumbs, ConnectSearchBar } from '@powerhousedao/design-system';
import { DocumentModel } from 'document-model/document';
import { useEffect, useState } from 'react';
import Button from 'src/components/button';
import { DocumentEditor } from 'src/components/editors';
import FolderView from 'src/components/folder-view';
import { useDocumentDrive } from 'src/hooks/useDocumentDrive';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import {
    preloadTabs,
    useFileNodeDocument,
    useSelectFolder,
    useSelectedDrive,
    useSelectedPath,
} from 'src/store';
import { useDocumentModels } from 'src/store/document-model';

const Content = () => {
    const selectFolder = useSelectFolder();
    const selectedDrive = useSelectedDrive();
    const selectedPath = useSelectedPath();
    const { addFile, addDocument, deleteNode } = useDocumentDrive();
    const documentModels = useDocumentModels();
    const { onItemOptionsClick, onItemClick, onSubmitInput } =
        useDrivesContainer();

    const [selectedFileNode, setSelectedFileNode] = useState<
        { drive: string; path: string } | undefined
    >(undefined);
    const [selectedDocument, updateDocument, saveDocument] =
        useFileNodeDocument(selectedFileNode?.drive, selectedFileNode?.path);

    const currentNode = selectedPath[selectedPath.length - 1];

    // preload document editors
    useEffect(() => {
        preloadTabs();
    }, []);

    useEffect(() => {
        return window.electronAPI?.handleFileOpen(async file => {
            if (!selectedDrive) {
                return;
            }
            const fileNode = await addFile(file, selectedDrive.id, '');
            if (fileNode) {
                setSelectedFileNode({
                    drive: selectedDrive.id,
                    path: fileNode.path,
                });
            }
        });
    }, [selectedDrive]);

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
        if (!selectedDrive) {
            throw new Error('No drive selected');
        }

        const node = await addDocument(
            documentModel.utils.createDocument(),
            selectedDrive?.id ?? '',
            currentNode?.id ?? '',
            `New ${documentModel.documentModel.name}`
        );
        if (node) {
            setSelectedFileNode({ drive: selectedDrive.id, path: node.path });
        }
    }

    return (
        <div className="flex h-full flex-col bg-[#F4F4F4] p-6">
            {selectedDocument ? (
                <div className="flex-1 rounded-[20px] bg-[#FCFCFC] p-4">
                    <DocumentEditor
                        document={selectedDocument}
                        onChange={updateDocument}
                        onSave={saveDocument}
                        onClose={() => setSelectedFileNode(undefined)}
                    />
                </div>
            ) : (
                <>
                    <ConnectSearchBar className="mb-5 flex-shrink-0 bg-[#FCFCFC]" />
                    <div className="flex-grow overflow-auto rounded-[20px] bg-[#FCFCFC] p-2">
                        {selectedDrive && (
                            <Breadcrumbs
                                rootItem={selectedDrive}
                                onItemClick={(e, item) => {
                                    onItemClick(
                                        e,
                                        item as any,
                                        selectedDrive as any
                                    ); // TODO deal with generics
                                }}
                                onAddNewItem={(item, option) =>
                                    onItemOptionsClick(
                                        item as any,
                                        option,
                                        selectedDrive as any
                                    )
                                }
                                onSubmitInput={item =>
                                    onSubmitInput(item, selectedDrive as any)
                                }
                                onCancelInput={console.log}
                            />
                        )}
                        <div className="px-4">
                            <div className="py-3">
                                {selectedDrive && selectedPath.length ? (
                                    <FolderView
                                        drive={selectedDrive.id}
                                        folder={
                                            currentNode.id !== selectedDrive.id
                                                ? currentNode
                                                : undefined
                                        }
                                        onFolderSelected={selectFolder}
                                        onFileSelected={(drive, path) =>
                                            setSelectedFileNode({ drive, path })
                                        }
                                        onFileDeleted={deleteNode}
                                    />
                                ) : null}
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
