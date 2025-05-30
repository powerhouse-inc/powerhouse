import { useShowDeleteNodeModal, useUiNodes } from '#hooks';
import { FolderItem, useDrop } from '@powerhousedao/design-system';
import {
    useNodeFileChildrenIds,
    useNodeFolderChildrenIds,
    useSelectedDriveId,
    useSelectedParentNodeId,
} from '@powerhousedao/reactor-browser';
import { useTranslation } from 'react-i18next';
import { twMerge } from 'tailwind-merge';
import { ContentSection } from './content/index.js';
import FileContentView from './file-content-view.js';

export function FolderView(props: { isAllowedToCreateDocuments?: boolean }) {
    const { t } = useTranslation();
    const { isAllowedToCreateDocuments = false } = props;
    const selectedParentNodeId = useSelectedParentNodeId();
    const selectedDriveId = useSelectedDriveId();
    const { onAddFile, onMoveNode, onCopyNode, onRenameNode, onDuplicateNode } =
        useUiNodes();
    const showDeleteNodeModal = useShowDeleteNodeModal();
    const { isDropTarget, dropProps } = useDrop({
        nodeId: selectedParentNodeId,
        driveId: selectedDriveId,
        onAddFile,
        onMoveNode,
        onCopyNode,
    });

    const folderNodeIds = useNodeFolderChildrenIds(selectedParentNodeId);
    const fileNodeIds = useNodeFileChildrenIds(selectedParentNodeId);

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
                {folderNodeIds.length > 0 ? (
                    folderNodeIds.map(folderNodeId => (
                        <FolderItem
                            key={folderNodeId}
                            nodeId={folderNodeId}
                            onRenameNode={onRenameNode}
                            onDuplicateNode={onDuplicateNode}
                            onAddFile={onAddFile}
                            onCopyNode={onCopyNode}
                            onMoveNode={onMoveNode}
                            showDeleteNodeModal={showDeleteNodeModal}
                            isAllowedToCreateDocuments={
                                isAllowedToCreateDocuments
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
                        fileNodeIds.length > 0 ? 'min-h-[400px]' : 'min-h-14',
                    )}
                >
                    <FileContentView
                        isAllowedToCreateDocuments={isAllowedToCreateDocuments}
                    />
                </div>
            </ContentSection>
        </div>
    );
}

export default FolderView;
