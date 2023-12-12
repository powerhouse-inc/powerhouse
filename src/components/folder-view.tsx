import {
    FileItem,
    FolderItem,
    TreeItem,
    decodeID,
} from '@powerhousedao/design-system';
import { FileNode, FolderNode } from 'document-model-libs/document-drive';
import { useTranslation } from 'react-i18next';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { useGetReadableItemPath } from 'src/hooks/useGetReadableItemPath';
import { ContentSection } from './content';

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
                            onOptionsClick={() =>
                                onFileDeleted(decodedDriveID, file.id)
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
