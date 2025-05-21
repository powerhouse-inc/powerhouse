import { useConnectConfig, useDocumentDriveServer, useUiNodes } from '#hooks';
import { Breadcrumbs, useBreadcrumbs } from '@powerhousedao/design-system';
import { useUiNodesContext } from '@powerhousedao/reactor-browser';
import { type DocumentModelModule } from 'document-model';
import { useCallback } from 'react';
import Button from './button.js';
import FolderView from './folder-view.js';
import { useModal } from './modal/index.js';
import { SearchBar } from './search-bar.js';

const getDocumentModelName = (name: string) => {
    if (name === 'RealWorldAssets') {
        return 'RWA Portfolio';
    }
    return name;
};

export function DriveView() {
    const [connectConfig] = useConnectConfig();
    const { showModal } = useModal();
    const { addFolder } = useDocumentDriveServer();
    const {
        selectedDriveNode,
        selectedParentNode,
        setSelectedNode,
        selectedNodePath,
        getNodeById,
    } = useUiNodesContext();
    const uiNodes = useUiNodes();
    const { documentModels, isAllowedToCreateDocuments } = uiNodes;

    const createFolder = useCallback(
        (name: string, parentFolder: string | undefined) => {
            if (!selectedDriveNode) {
                return;
            }
            addFolder(selectedDriveNode.id, name, parentFolder).catch(
                console.error,
            );
        },
        [selectedDriveNode, addFolder],
    );

    const { breadcrumbs, onBreadcrumbSelected } = useBreadcrumbs({
        selectedNodePath,
        getNodeById,
        setSelectedNode,
    });

    const createDocument = useCallback(
        (documentModel: DocumentModelModule) => {
            if (!selectedDriveNode) return;

            showModal('createDocument', {
                documentModel,
                selectedParentNode,
                setSelectedNode,
            });
        },
        [selectedDriveNode, selectedParentNode, setSelectedNode, showModal],
    );

    return (
        <div className="grow overflow-auto rounded-2xl p-2">
            <Breadcrumbs
                breadcrumbs={breadcrumbs}
                onBreadcrumbSelected={onBreadcrumbSelected}
                createEnabled={isAllowedToCreateDocuments}
                onCreate={createFolder}
            />
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
                                    aria-details={doc.documentModel.description}
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
    );
}
