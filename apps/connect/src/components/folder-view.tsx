import {
    FileItem,
    FolderItem,
    TreeItem,
    decodeID,
    defaultDropdownMenuOptions,
} from '@powerhousedao/design-system';
import { FileNode, FolderNode } from 'document-model-libs/document-drive';
import { useTranslation } from 'react-i18next';
import { useModal } from 'src/components/modal';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useGetReadableItemPath } from 'src/hooks/useGetReadableItemPath';
import { ContentSection } from './content';

const itemOptions = defaultDropdownMenuOptions.filter(
    option => option.id === 'delete'
);

interface IProps {
    drive: string;
    folder?: TreeItem;
    onFolderSelected: (itemId: string) => void;
    onFileSelected: (drive: string, id: string) => void;
    onFileDeleted: (drive: string, id: string) => void;
}

export const FolderView: React.FC<IProps> = ({
    drive,
    folder,
    onFolderSelected,
    onFileSelected,
    onFileDeleted,
}) => {
    const { t } = useTranslation();
    const { showModal } = useModal();
    const getReadableItemPath = useGetReadableItemPath();
    const { getChildren } = useDocumentDriveServer();
    const folderId = folder ? decodeID(folder.id) : undefined;
    const children = getChildren(
        drive,
        folderId !== drive ? folderId : undefined
    );
    const folders = children.filter(
        node => node.kind === 'folder'
    ) as FolderNode[];
    const decodedDriveID = decodeID(drive);
    const files = children.filter(node => node.kind === 'file') as FileNode[];

    const onFolderOptionsClick = (optionId: string, folderNode: FolderNode) => {
        if (optionId === 'delete') {
            showModal('deleteItem', {
                driveId: decodedDriveID,
                itemId: folderNode.id,
                itemName: folderNode.name,
            });
        }
    };

    const onFileOptionsClick = (optionId: string, fileNode: FileNode) => {
        if (optionId === 'delete') {
            onFileDeleted(decodedDriveID, fileNode.id);
        }
    };

    return (
        <div>
            <ContentSection
                title={t('folderView.sections.folders.title')}
                className="mb-4"
            >
                {folders.length > 0 ? (
                    folders.map(folder => (
                        <FolderItem
                            key={folder.id}
                            title={folder.name}
                            className="w-64"
                            onClick={() => onFolderSelected(folder.id)}
                            itemOptions={itemOptions}
                            onOptionsClick={optionId =>
                                onFolderOptionsClick(optionId, folder)
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
                {files.length > 0 ? (
                    files.map(file => (
                        <FileItem
                            key={file.id}
                            title={file.name}
                            subTitle={getReadableItemPath(file.id)}
                            className="w-64"
                            itemOptions={itemOptions}
                            onOptionsClick={optionId =>
                                onFileOptionsClick(optionId, file)
                            }
                            onClick={() =>
                                onFileSelected(decodedDriveID, file.id)
                            }
                        />
                    ))
                ) : (
                    <div className="mb-8 text-sm text-gray-400">
                        {t('folderView.sections.documents.empty')}
                    </div>
                )}
            </ContentSection>
        </div>
    );
};

export default FolderView;
