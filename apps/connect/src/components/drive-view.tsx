import {
    useConnectConfig,
    useDocumentDriveServer,
    useNodeActions,
    useUserPermissions,
} from '#hooks';
import { useFilteredDocumentModels } from '#store';
import { Breadcrumbs, useBreadcrumbs } from '@powerhousedao/design-system';
import {
    useSelectedNodePath,
    useSelectedParentFolder,
    useSetSelectedNode,
    useUnwrappedSelectedDrive,
    useUnwrappedSelectedFolder,
} from '@powerhousedao/state';
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
    const selectedDrive = useUnwrappedSelectedDrive();
    const selectedFolder = useUnwrappedSelectedFolder();
    const parentFolder = useSelectedParentFolder();
    const selectedNodePath = useSelectedNodePath();
    const setSelectedNode = useSetSelectedNode();

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
    } = useNodeActions();
    const createFolder = useCallback(
        (name: string, parentFolder: string | undefined) => {
            if (!selectedDrive) {
                return;
            }
            addFolder(selectedDrive.header.id, name, parentFolder).catch(
                console.error,
            );
        },
        [selectedDrive?.header.id, addFolder],
    );

    const { breadcrumbs, onBreadcrumbSelected } = useBreadcrumbs({
        selectedNodePath,
        setSelectedNode,
    });

    const createDocument = useCallback(
        (documentModel: DocumentModelModule) => {
            if (!selectedDrive) return;

            showModal('createDocument', {
                documentModel,
                selectedDrive,
                selectedFolder,
                parentFolder,
                setSelectedNode,
            });
        },
        [
            selectedDrive,
            selectedFolder,
            parentFolder,
            setSelectedNode,
            showModal,
        ],
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
                                    title={doc.documentModel.name}
                                    aria-label={doc.documentModel.name}
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
