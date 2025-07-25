import {
    useDocumentDriveServer,
    useNodeActions,
    useShowDeleteNodeModal,
} from '#hooks';
import { FolderItem, useDrop } from '@powerhousedao/design-system';
import {
    useFileChildNodes,
    useFolderChildNodes,
    useSelectedDriveSharingType,
    useSelectedFolder,
    useSetSelectedNode,
} from '@powerhousedao/state';
import { useTranslation } from 'react-i18next';
import { twMerge } from 'tailwind-merge';
import { ContentSection } from './content/index.js';
import FileContentView from './file-content-view.js';

export function FolderView(props: { isAllowedToCreateDocuments?: boolean }) {
    const selectedFolder = useSelectedFolder();
    const setSelectedNode = useSetSelectedNode();
    const sharingType = useSelectedDriveSharingType();
    const { t } = useTranslation();
    const {
        onAddFile,
        onMoveNode,
        onCopyNode,
        onRenameNode,
        onDuplicateNode,
        onAddFolder,
        onAddAndSelectNewFolder,
    } = useNodeActions();
    const { getSyncStatusSync } = useDocumentDriveServer();
    const showDeleteNodeModal = useShowDeleteNodeModal();
    const { isDropTarget, dropProps } = useDrop({
        node: selectedFolder,
        onAddFile,
        onMoveNode,
        onCopyNode,
    });

    const folderNodes = useFolderChildNodes();
    const fileNodes = useFileChildNodes();

    return (
        <div
            {...dropProps}
            className={twMerge(
                'rounded-md border-2 border-transparent p-2',
                isDropTarget && 'border-dashed border-blue-100',
            )}
        >
            <ContentSection
                title={t('folderView.sections.folders.title')}
                className="mb-4"
            >
                {folderNodes.length > 0 ? (
                    folderNodes.map(folderNode => (
                        <FolderItem
                            key={folderNode.id}
                            folderNode={folderNode}
                            sharingType={sharingType ?? 'LOCAL'}
                            getSyncStatusSync={getSyncStatusSync}
                            setSelectedNode={setSelectedNode}
                            onAddFile={onAddFile}
                            onMoveNode={onMoveNode}
                            onCopyNode={onCopyNode}
                            onRenameNode={onRenameNode}
                            onDuplicateNode={onDuplicateNode}
                            showDeleteNodeModal={showDeleteNodeModal}
                            onAddFolder={onAddFolder}
                            onAddAndSelectNewFolder={onAddAndSelectNewFolder}
                            isAllowedToCreateDocuments={
                                props.isAllowedToCreateDocuments ?? false
                            }
                        />
                    ))
                ) : (
                    <div className="mb-8 text-sm text-gray-400">
                        {t('folderView.sections.folders.empty')}
                    </div>
                )}
            </ContentSection>
            <ContentSection title={t('folderView.sections.documents.title')}>
                <div
                    className={twMerge(
                        'w-full',
                        fileNodes.length > 0 ? 'min-h-[400px]' : 'min-h-14',
                    )}
                >
                    <FileContentView {...props} fileNodes={fileNodes} />
                </div>
            </ContentSection>
        </div>
    );
}

export default FolderView;
