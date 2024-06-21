import { TreeItem, useDraggableTarget } from '@powerhousedao/design-system';
import { useTranslation } from 'react-i18next';
import { useUserPermissions } from 'src/hooks/useUserPermissions';

import { useFileOptions } from 'src/hooks/useFileOptions';
import { useFolderContent } from 'src/hooks/useFolderContent';
import { useFolderOptions } from 'src/hooks/useFolderOptions';
import { useOnDropEvent } from 'src/hooks/useOnDropEvent';
import { twMerge } from 'tailwind-merge';
import { ContentSection } from './content';
import FileContentView from './file-content-view';
import { FolderItem } from './folder-item';

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
    const { folderItemOptions, onFolderOptionsClick } =
        useFolderOptions(decodedDriveID);
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
                            folderItemOptions={folderItemOptions}
                            onFolderOptionsClick={onFolderOptionsClick}
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
                    // eslint-disable-next-line tailwindcss/no-arbitrary-value
                    className={twMerge(
                        'w-full',
                        files.length > 0 ? 'min-h-[400px]' : 'min-h-14',
                    )}
                >
                    <FileContentView
                        files={files}
                        onFileDeleted={onFileDeleted}
                        decodedDriveID={decodedDriveID}
                        onFileSelected={onFileSelected}
                        fileItemOptions={fileItemOptions}
                        onFileOptionsClick={onFileOptionsClick}
                        isAllowedToCreateDocuments={isAllowedToCreateDocuments}
                    />
                </div>
            </ContentSection>
        </div>
    );
};

export default FolderView;
