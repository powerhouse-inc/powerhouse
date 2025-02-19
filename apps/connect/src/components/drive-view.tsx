import { useConnectConfig } from '#hooks/useConnectConfig';
import { useUiNodes } from '#hooks/useUiNodes';
import { Breadcrumbs } from '@powerhousedao/design-system';
import { DocumentModelModule } from 'document-model';
import Button from './button';
import FolderView from './folder-view';
import { useModal } from './modal';
import { SearchBar } from './search-bar';

const getDocumentModelName = (name: string) => {
    if (name === 'RealWorldAssets') {
        return 'RWA Portfolio';
    }
    return name;
};

export function DriveView() {
    const [connectConfig] = useConnectConfig();
    const { showModal } = useModal();
    const uiNodes = useUiNodes();
    const {
        documentModels,
        isAllowedToCreateDocuments,
        selectedDriveNode,
        selectedParentNode,
        setSelectedNode,
    } = uiNodes;

    function createDocument(documentModel: DocumentModelModule) {
        if (!selectedDriveNode) return;

        showModal('createDocument', {
            documentModel,
            selectedParentNode,
            setSelectedNode,
        });
    }

    return (
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
                                    key={doc.documentModelState.id}
                                    aria-details={
                                        doc.documentModelState.description
                                    }
                                    className="bg-gray-200 text-slate-800"
                                    onClick={() => createDocument(doc)}
                                >
                                    <span className="text-sm">
                                        {getDocumentModelName(
                                            doc.documentModelState.name,
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
