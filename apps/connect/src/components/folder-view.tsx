import { TreeItem, useDraggableTarget } from '@powerhousedao/design-system';
import { useTranslation } from 'react-i18next';
import FileItem from 'src/components/file-item/file-item';
import { FolderItem } from 'src/components/folder-item';
import { useUserPermissions } from 'src/hooks/useUserPermissions';

import { useFileOptions } from 'src/hooks/useFileOptions';
import { useFolderContent } from 'src/hooks/useFolderContent';
import { useOnDropEvent } from 'src/hooks/useOnDropEvent';
import { twMerge } from 'tailwind-merge';
import { ContentSection } from './content';

interface IProps {
    decodedDriveID: string;
    path: string;
    folderItem: TreeItem;
    onFolderSelected: (itemId: string) => void;
    onFileSelected: (drive: string, id: string) => void;
    onFileDeleted: (drive: string, id: string) => void;
}

export const FolderView: React.FC<IProps> = ({
    path,
    folderItem,
    decodedDriveID,
    onFileDeleted,
    onFileSelected,
    onFolderSelected,
}) => {
    const { t } = useTranslation();
    const { folders, files } = useFolderContent(path);
    const { isAllowedToCreateDocuments } = useUserPermissions();
    const { fileItemOptions, onFileOptionsClick } =
        useFileOptions(decodedDriveID);
    const onDropEvent = useOnDropEvent();

    const { dropProps, isDropTarget } = useDraggableTarget({
        data: folderItem,
        onDropEvent,
    });

    return (
        <div
            {...dropProps}
            className={twMerge(
                'rounded-md border-2 border-dashed border-transparent p-2',
                isDropTarget && 'border-blue-100',
            )}
        >
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
                {files.length > 0 ? (
                    files.map(file => (
                        <FileItem
                            key={file.id}
                            file={file}
                            decodedDriveID={decodedDriveID}
                            onFileDeleted={onFileDeleted}
                            onFileSelected={onFileSelected}
                            itemOptions={fileItemOptions}
                            onFileOptionsClick={onFileOptionsClick}
                            isAllowedToCreateDocuments={
                                isAllowedToCreateDocuments
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
