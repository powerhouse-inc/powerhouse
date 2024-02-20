import { decodeID } from '@powerhousedao/design-system';
import { useTranslation } from 'react-i18next';
import { FileItem } from 'src/components/file-item';
import { FolderItem } from 'src/components/folder-item';
import { useFolderContent } from 'src/hooks/useFolderContent';
import { ContentSection } from './content';

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
    const decodedDriveID = decodeID(drive);

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
                            file={file}
                            drive={drive}
                            onFileDeleted={onFileDeleted}
                            onFileSelected={onFileSelected}
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
