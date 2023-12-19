import {
    FileItem,
    TreeItem,
    decodeID,
    defaultDropdownMenuOptions,
} from '@powerhousedao/design-system';
import { useTranslation } from 'react-i18next';
import { FolderItem } from 'src/components/folder-item';
import { useFolderContent } from 'src/hooks/useFolderContent';
import { useGetReadableItemPath } from 'src/hooks/useGetReadableItemPath';
import { ContentSection } from './content';

const itemOptions = defaultDropdownMenuOptions.filter(
    option => option.id === 'delete'
);

interface IProps {
    drive: string;
    path: string;
    onFolderSelected: (itemId: string) => void;
    onFileSelected: (drive: string, id: string) => void;
    onFileDeleted: (drive: string, id: string) => void;
}

export const FolderView: React.FC<IProps> = ({
    path,
    drive,
    onFileDeleted,
    onFileSelected,
    onFolderSelected,
}) => {
    const { t } = useTranslation();
    const { folders, files } = useFolderContent(path);
    const getReadableItemPath = useGetReadableItemPath();

    const decodedDriveID = decodeID(drive);

    const onFileOptionsClick = (optionId: string, fileNode: TreeItem) => {
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
                            folder={folder}
                            decodedDriveID={decodedDriveID}
                            onFolderSelected={onFolderSelected}
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
                            title={file.label}
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
