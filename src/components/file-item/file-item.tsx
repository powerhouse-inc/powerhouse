import {
    ConnectDropdownMenuItem,
    FileItem as ConnectFileItem,
    TreeItem,
} from '@powerhousedao/design-system';
import { useState } from 'react';
import { useDrivesContainer } from 'src/hooks/useDrivesContainer';
import { SetIsWriteMode } from 'src/hooks/useFileOptions';
import { useGetReadableItemPath } from 'src/hooks/useGetReadableItemPath';

interface IProps {
    file: TreeItem;
    decodedDriveID: string;
    onFileSelected: (drive: string, id: string) => void;
    onFileDeleted: (drive: string, id: string) => void;
    isAllowedToCreateDocuments: boolean;
    itemOptions?: ConnectDropdownMenuItem[];
    onFileOptionsClick?: (
        optionId: string,
        fileNode: TreeItem,
        setIsWriteMode: SetIsWriteMode,
    ) => Promise<void>;
}

export const FileItem: React.FC<IProps> = ({
    file,
    decodedDriveID,
    onFileSelected,
    itemOptions = [],
    isAllowedToCreateDocuments,
    onFileOptionsClick = () => {},
}) => {
    const [isWriteMode, setIsWriteMode] = useState(false);
    const getReadableItemPath = useGetReadableItemPath();
    const { updateNodeName } = useDrivesContainer();

    const cancelInputHandler = () => setIsWriteMode(false);
    const submitInputHandler = (value: string) => {
        setIsWriteMode(false);
        updateNodeName({ ...file, label: value }, decodedDriveID);
    };

    return (
        <ConnectFileItem
            displaySyncIcon
            key={file.id}
            title={file.label}
            subTitle={getReadableItemPath(file.id)}
            className="w-64"
            itemOptions={itemOptions}
            onCancelInput={cancelInputHandler}
            onSubmitInput={submitInputHandler}
            mode={isWriteMode ? 'write' : 'read'}
            onOptionsClick={optionId =>
                onFileOptionsClick(optionId, file, setIsWriteMode)
            }
            item={file}
            onClick={() =>
                !isWriteMode && onFileSelected(decodedDriveID, file.id)
            }
            isAllowedToCreateDocuments={isAllowedToCreateDocuments}
        />
    );
};

export default FileItem;
