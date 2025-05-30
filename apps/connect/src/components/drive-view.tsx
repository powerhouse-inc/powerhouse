import {
    useConnectConfig,
    useDocumentDriveServer,
    useShowCreateDocumentModal,
    useUiNodes,
    useUserPermissions,
} from '#hooks';
import { useFilteredDocumentModels } from '#store';
import { Breadcrumbs, useBreadcrumbs } from '@powerhousedao/design-system';
import { useSelectedDriveId } from '@powerhousedao/reactor-browser';
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
    const selectedDriveId = useSelectedDriveId();
    const { isAllowedToCreateDocuments } = useUserPermissions() ?? {};
    const documentModels = useFilteredDocumentModels();
    const {
        onAddFile,
        onAddFolder,
        onRenameNode,
        onCopyNode,
        onMoveNode,
        onDuplicateNode,
        onAddAndSelectNewFolder,
    } = useUiNodes();
    const createFolder = useCallback(
        (name: string, parentFolder: string | undefined) => {
            if (!selectedDriveId) {
                return;
            }
            addFolder(selectedDriveId, name, parentFolder).catch(console.error);
        },
        [selectedDriveId, addFolder],
    );

    const showCreateDocumentModal = useShowCreateDocumentModal();

    const { breadcrumbs, onBreadcrumbSelected } = useBreadcrumbs();

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
                    <FolderView
                        isAllowedToCreateDocuments={isAllowedToCreateDocuments}
                    />
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
                                    onClick={() => showCreateDocumentModal(doc)}
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
