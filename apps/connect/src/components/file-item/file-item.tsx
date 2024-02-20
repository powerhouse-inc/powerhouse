import {
    FileItem as ConnectFileItem,
    FileItemProps,
    Icon,
    TreeItem,
    decodeID,
    defaultDropdownMenuOptions,
} from '@powerhousedao/design-system';
import { FileNode } from 'document-model-libs/document-drive';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentDriveById } from 'src/hooks/useDocumentDriveById';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { useGetDocumentById } from 'src/hooks/useGetDocumentById';
import { useGetReadableItemPath } from 'src/hooks/useGetReadableItemPath';
import { getSwitchboardUrl } from 'src/utils/getSwitchboardUrl';
import { openUrl } from 'src/utils/openUrl';

const allowedItemOptions = ['delete', 'rename'];

const defaultItemOptions = defaultDropdownMenuOptions.filter(option =>
    allowedItemOptions.includes(option.id),
);

interface IProps {
    file: TreeItem;
    drive: string;
    onFileSelected: (drive: string, id: string) => void;
    onFileDeleted: (drive: string, id: string) => void;
}

export const FileItem: React.FC<IProps> = ({
    file,
    drive,
    onFileDeleted,
    onFileSelected,
}) => {
    const { t } = useTranslation();
    const [isWriteMode, setIsWriteMode] = useState(false);
    const getReadableItemPath = useGetReadableItemPath();
    const getDocumentById = useGetDocumentById();
    const { updateNodeName } = useDrivesContainer();

    const decodedDriveID = decodeID(drive);
    const { isRemoteDrive, remoteUrl } = useDocumentDriveById(decodedDriveID);

    const onFileOptionsClick = async (optionId: string, fileNode: TreeItem) => {
        if (optionId === 'delete') {
            onFileDeleted(decodedDriveID, fileNode.id);
        }

        if (optionId === 'rename') {
            setIsWriteMode(true);
        }

        if (optionId === 'switchboard-link') {
            if (!remoteUrl) return;
            const url = new URL(remoteUrl);
            const baseUrl = url.origin;
            const document = getDocumentById(decodedDriveID, fileNode.id) as
                | FileNode
                | undefined;

            if (document) {
                const url = getSwitchboardUrl(
                    baseUrl,
                    decodedDriveID,
                    document.documentType,
                    document.id,
                );

                await openUrl(url);
            }
        }
    };

    const itemOptions: FileItemProps['itemOptions'] = isRemoteDrive
        ? [
              {
                  id: 'switchboard-link',
                  label: t('files.options.switchboardLink'),
                  icon: (
                      <div className="flex w-6 justify-center">
                          <Icon name="drive" size={16} />
                      </div>
                  ),
              },
              ...defaultItemOptions,
          ]
        : defaultItemOptions;

    const cancelInputHandler = () => setIsWriteMode(false);
    const submitInputHandler = (value: string) => {
        setIsWriteMode(false);
        updateNodeName({ ...file, label: value }, decodedDriveID);
    };

    return (
        <ConnectFileItem
            key={file.id}
            title={file.label}
            subTitle={getReadableItemPath(file.id)}
            className="w-64"
            itemOptions={itemOptions}
            onCancelInput={cancelInputHandler}
            onSubmitInput={submitInputHandler}
            mode={isWriteMode ? 'write' : 'read'}
            onOptionsClick={optionId => onFileOptionsClick(optionId, file)}
            onClick={() =>
                !isWriteMode && onFileSelected(decodedDriveID, file.id)
            }
        />
    );
};

export default FileItem;
