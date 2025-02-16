import { Breadcrumbs, FILE } from '@powerhousedao/design-system';
import { DocumentModel } from 'document-model/document';
import { useEffect } from 'react';
import Button from 'src/components/button';
import { DocumentEditorContainer } from 'src/components/document-editor-container';
import FolderView from 'src/components/folder-view';
import { Footer } from 'src/components/footer';
import { useModal } from 'src/components/modal';
import { SearchBar } from 'src/components/search-bar';
import { useConnectConfig } from 'src/hooks/useConnectConfig';
import { useNodeNavigation } from 'src/hooks/useNodeNavigation';
import { useUiNodes } from 'src/hooks/useUiNodes';

const getDocumentModelName = (name: string) => {
    if (name === 'RealWorldAssets') {
        return 'RWA Portfolio';
    }

    return name;
};

export default function Content() {
    const [connectConfig] = useConnectConfig();
    const uiNodes = useUiNodes();
    const {
        fileNodeDocument,
        documentModels,
        isAllowedToCreateDocuments,
        selectedDriveNode,
        selectedParentNode,
        setSelectedNode,
        selectedNode,
        addFile,
    } = useUiNodes();
    useNodeNavigation();
    const { showModal } = useModal();

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

    function createDocument(documentModel: DocumentModel) {
        if (!selectedDriveNode) return;

        showModal('createDocument', {
            documentModel,
            selectedParentNode,
            setSelectedNode,
        });
    }

    return (
        <div
            className="flex h-full flex-col overflow-auto bg-gray-100 p-6 pb-3"
            id="content-view"
        >
            {fileNodeDocument ? (
                <DocumentEditorContainer key={fileNodeDocument.documentId} />
            ) : (
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
                                    {documentModels?.map(doc => (
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
                            </>
                        )}
                    </div>
                </div>
            )}
            <div className="flex w-full flex-row justify-end pr-3 pt-3">
                <Footer />
            </div>
        </div>
    );
}
